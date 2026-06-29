// Sprint risk assessment — pure heuristic, no external LLM.
//
// Computes current velocity (cards completed per day), compares it to the
// remaining work, and projects whether the sprint deadline will be met.

import { PrismaClient } from "@prisma/client";
import type { SprintRiskResult } from "../types";

const DAY_MS = 24 * 60 * 60 * 1000;
const VELOCITY_WINDOW_DAYS = 14;
const MIN_VELOCITY = 0.01; // floor to avoid divide-by-zero when nothing's done

/**
 * Assess sprint risk for a board.
 * Returns null when the board has no sprintEnd set.
 */
export async function assessSprintRisk(
  db: PrismaClient,
  boardId: string
): Promise<SprintRiskResult | null> {
  const board = await db.board.findUnique({
    where: { id: boardId },
    select: { sprintStart: true, sprintEnd: true },
  });
  if (!board || !board.sprintEnd) return null;

  const now = new Date();
  const daysRemaining = Math.ceil(
    (board.sprintEnd.getTime() - now.getTime()) / DAY_MS
  );

  // ── Cards remaining = cards NOT in done columns ──
  const nonDoneColumns = await db.column.findMany({
    where: { boardId, isDone: false },
    select: { id: true, name: true },
  });
  const nonDoneColumnIds = nonDoneColumns.map((c) => c.id);
  const cardsRemaining = await db.card.count({
    where: { boardId, columnId: { in: nonDoneColumnIds } },
  });

  // ── Velocity: completed activities over the last 14 days ──
  // If sprintStart exists, use days since sprintStart (capped at 14).
  const since14 = new Date(now.getTime() - VELOCITY_WINDOW_DAYS * DAY_MS);
  const completedActivities = await db.activity.count({
    where: {
      boardId,
      type: "completed",
      createdAt: { gte: since14 },
    },
  });

  let velocityDays = VELOCITY_WINDOW_DAYS;
  if (board.sprintStart) {
    const sinceSprintStart = Math.max(
      1,
      Math.ceil((now.getTime() - board.sprintStart.getTime()) / DAY_MS)
    );
    velocityDays = Math.min(VELOCITY_WINDOW_DAYS, sinceSprintStart);
  }
  const velocity = completedActivities / velocityDays;
  const safeVelocity = Math.max(velocity, MIN_VELOCITY);

  const projectedCompletionDays = cardsRemaining / safeVelocity;
  const willMeetDeadline = projectedCompletionDays <= daysRemaining;

  let riskLevel: SprintRiskResult["riskLevel"];
  if (willMeetDeadline) {
    riskLevel = "low";
  } else if (projectedCompletionDays <= daysRemaining * 1.5) {
    riskLevel = "medium";
  } else {
    riskLevel = "high";
  }

  const summary = buildSummary({
    velocity,
    velocityDays,
    projectedCompletionDays,
    cardsRemaining,
    daysRemaining,
    willMeetDeadline,
    nonDoneColumns: nonDoneColumns.map((c) => c.name),
  });

  return {
    daysRemaining,
    cardsRemaining,
    velocity,
    projectedCompletionDays,
    willMeetDeadline,
    riskLevel,
    summary,
  };
}

function buildSummary(args: {
  velocity: number;
  velocityDays: number;
  projectedCompletionDays: number;
  cardsRemaining: number;
  daysRemaining: number;
  willMeetDeadline: boolean;
  nonDoneColumns: string[];
}): string {
  const {
    velocity,
    velocityDays,
    projectedCompletionDays,
    cardsRemaining,
    daysRemaining,
    willMeetDeadline,
    nonDoneColumns,
  } = args;

  if (cardsRemaining === 0) {
    return `All cards are complete. Velocity over the last ${velocityDays} days was ${velocity.toFixed(
      2
    )} cards/day — sprint is on track.`;
  }

  const velocityStr = velocity.toFixed(2);
  const projectedStr = projectedCompletionDays.toFixed(1);

  if (willMeetDeadline) {
    return `At your current velocity of ${velocityStr} cards/day, you'll need ${projectedStr} days to clear ${cardsRemaining} remaining card(s). The sprint ends in ${daysRemaining} day(s) — you're on track.`;
  }

  const missBy = Math.max(0, projectedCompletionDays - daysRemaining);
  const hint =
    nonDoneColumns.length > 0
      ? ` Consider re-scoping or unblocking the ${nonDoneColumns[0]} column.`
      : "";
  return `At your current velocity of ${velocityStr} cards/day, you'll need ${projectedStr} days to clear ${cardsRemaining} remaining card(s). The sprint ends in ${daysRemaining} day(s) — you're on track to miss it by ~${Math.ceil(
    missBy
  )} day(s).${hint}`;
}
