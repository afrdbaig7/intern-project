// Weekly digest generation — pure heuristic, no external LLM.
//
// Summarises the last 7 days of activity: completions, creations, daily
// velocity trend, top bottleneck column, and per-assignee completion counts.

import { PrismaClient } from "@prisma/client";
import type { DigestContent } from "../types";
import { detectBottlenecks } from "./bottleneck";

const DAY_MS = 24 * 60 * 60 * 1000;
const WINDOW_DAYS = 7;

function midnight(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  return out;
}

/**
 * Build a weekly digest for a board.
 * Always returns a DigestContent — even on an empty board (zeros + empty arrays).
 */
export async function generateDigest(
  db: PrismaClient,
  boardId: string
): Promise<DigestContent> {
  const now = new Date();
  const weekStart = midnight(new Date(now.getTime() - WINDOW_DAYS * DAY_MS));
  const weekEnd = now;

  // Pull all cards (with assignees) in one query — easier than many counts.
  const cards = await db.card.findMany({
    where: { boardId },
    select: {
      id: true,
      createdAt: true,
      completedAt: true,
      assigneeId: true,
      assignee: { select: { id: true, name: true } },
    },
  });

  const totalCompleted = cards.filter(
    (c) =>
      c.completedAt &&
      c.completedAt >= weekStart &&
      c.completedAt <= weekEnd
  ).length;
  const totalCreated = cards.filter(
    (c) => c.createdAt >= weekStart && c.createdAt <= weekEnd
  ).length;

  // ── Velocity trend: last 7 days, one bucket per day ──
  const velocityTrend: { date: string; completed: number }[] = [];
  for (let i = WINDOW_DAYS - 1; i >= 0; i--) {
    const dayStart = midnight(new Date(now.getTime() - i * DAY_MS));
    const dayEnd = new Date(dayStart.getTime() + DAY_MS);
    const completed = cards.filter(
      (c) =>
        c.completedAt && c.completedAt >= dayStart && c.completedAt < dayEnd
    ).length;
    velocityTrend.push({
      date: dayStart.toISOString().slice(0, 10),
      completed,
    });
  }

  // ── Top bottleneck ──
  const bottlenecks = await detectBottlenecks(db, boardId);
  const topBottleneck =
    bottlenecks.length > 0
      ? {
          column: bottlenecks[0].columnName,
          ratio: bottlenecks[0].ratio,
        }
      : null;

  // ── By assignee — completed this week, sorted desc ──
  const byAssigneeMap = new Map<
    string,
    { userId: string; name: string; completed: number }
  >();
  for (const c of cards) {
    if (
      c.completedAt &&
      c.completedAt >= weekStart &&
      c.completedAt <= weekEnd &&
      c.assigneeId &&
      c.assignee
    ) {
      const entry = byAssigneeMap.get(c.assigneeId);
      if (entry) entry.completed++;
      else
        byAssigneeMap.set(c.assigneeId, {
          userId: c.assigneeId,
          name: c.assignee.name,
          completed: 1,
        });
    }
  }
  const byAssignee = [...byAssigneeMap.values()].sort(
    (a, b) => b.completed - a.completed
  );

  // ── Plain-English summary ──
  const velocityPerDay = totalCompleted / WINDOW_DAYS;
  const bottleneckPart = topBottleneck
    ? `The top bottleneck was the ${topBottleneck.column} column.`
    : `No significant bottlenecks were detected.`;
  const leaderPart =
    byAssignee.length > 0
      ? `${byAssignee[0].name} led completion with ${byAssignee[0].completed} card(s).`
      : `No cards were completed this week.`;
  const summary = `This week the team completed ${totalCompleted} card(s) at an average velocity of ${velocityPerDay.toFixed(
    2
  )}/day. ${bottleneckPart} ${leaderPart}`;

  return {
    totalCompleted,
    totalCreated,
    velocityTrend,
    topBottleneck,
    byAssignee,
    summary,
  };
}
