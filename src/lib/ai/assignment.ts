// Assignment suggestion — pure heuristic, no external LLM.
//
// For a given unassigned card, scores every board member based on their
// past completion history with similar labels (Jaccard similarity), their
// relevant label history, and their current in-progress load.

import { PrismaClient } from "@prisma/client";
import type { AssignmentSuggestion } from "../types";

const SIMILARITY_THRESHOLD = 0.3;
const DAYS_TO_COMPLETE_FLOOR = 14; // anything that took longer than 14d contributes ~0 weight

/** Jaccard similarity between two label-name lists (case-insensitive). */
function jaccard(a: string[], b: string[]): number {
  const sa = new Set(a.map((s) => s.toLowerCase()));
  const sb = new Set(b.map((s) => s.toLowerCase()));
  if (sa.size === 0 && sb.size === 0) return 0;
  let inter = 0;
  for (const x of sa) if (sb.has(x)) inter++;
  const union = sa.size + sb.size - inter;
  return union === 0 ? 0 : inter / union;
}

interface MemberScore {
  userId: string;
  name: string;
  score: number;
  reasons: string[];
}

/**
 * Suggest the best assignee for a card.
 * Returns null when no member scores above 0 (e.g. empty board, no history).
 */
export async function suggestAssignee(
  db: PrismaClient,
  boardId: string,
  cardId: string
): Promise<AssignmentSuggestion | null> {
  const card = await db.card.findUnique({
    where: { id: cardId },
    include: {
      labels: { include: { label: { select: { name: true } } } },
    },
  });
  if (!card) return null;

  const cardLabelNames = card.labels.map((cl) => cl.label.name);

  // ── Board members ──
  const memberships = await db.boardMember.findMany({
    where: { boardId },
    include: { user: { select: { id: true, name: true } } },
  });
  if (memberships.length === 0) return null;

  // ── Past completions on this board (training data) ──
  const history = await db.cardHistory.findMany({
    where: { boardId, action: "completed" },
    select: { assigneeId: true, labelNames: true, daysToComplete: true },
  });

  // ── Current in-progress cards per assignee (load penalty) ──
  const nonDoneColumns = await db.column.findMany({
    where: { boardId, isDone: false },
    select: { id: true },
  });
  const nonDoneColumnIds = nonDoneColumns.map((c) => c.id);
  const inProgressCards = await db.card.findMany({
    where: {
      boardId,
      columnId: { in: nonDoneColumnIds },
      assigneeId: { not: null },
    },
    select: { assigneeId: true },
  });
  const inProgressCount = new Map<string, number>();
  for (const c of inProgressCards) {
    if (c.assigneeId) {
      inProgressCount.set(
        c.assigneeId,
        (inProgressCount.get(c.assigneeId) ?? 0) + 1
      );
    }
  }

  // ── Score each member ──
  const scores: MemberScore[] = [];
  for (const m of memberships) {
    let score = 0;
    const reasons: string[] = [];
    const userHist = history.filter((h) => h.assigneeId === m.user.id);

    // (a) +30 * (1 - daysToComplete/14) for each similar completed card.
    const similar = userHist.filter((h) => {
      const hLabels = (h.labelNames ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      return jaccard(cardLabelNames, hLabels) > SIMILARITY_THRESHOLD;
    });
    if (similar.length > 0) {
      let bonusSum = 0;
      let dtcSum = 0;
      for (const s of similar) {
        const dtc = s.daysToComplete ?? DAYS_TO_COMPLETE_FLOOR;
        dtcSum += dtc;
        bonusSum += 30 * Math.max(0, 1 - dtc / DAYS_TO_COMPLETE_FLOOR);
      }
      score += bonusSum;
      const avgDtc = dtcSum / similar.length;
      reasons.push(
        `Completed ${similar.length} similar card(s) — avg ${avgDtc.toFixed(
          1
        )} days to complete (+${bonusSum.toFixed(1)})`
      );
    }

    // (b) +20 if they have any completed card sharing a label with this card.
    const cardLabelsLower = new Set(
      cardLabelNames.map((l) => l.toLowerCase())
    );
    const labelMatchCount = userHist.filter((h) => {
      const hLabels = (h.labelNames ?? "")
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);
      return hLabels.some((l) => cardLabelsLower.has(l));
    }).length;
    if (labelMatchCount > 0) {
      score += 20;
      reasons.push(
        `Has completed ${labelMatchCount} card(s) sharing a label (+20)`
      );
    }

    // (c) -10 per current in-progress card.
    const inProg = inProgressCount.get(m.user.id) ?? 0;
    if (inProg > 0) {
      const penalty = -10 * inProg;
      score += penalty;
      reasons.push(`Currently has ${inProg} in-progress card(s) (${penalty})`);
    }

    scores.push({
      userId: m.user.id,
      name: m.user.name,
      score,
      reasons,
    });
  }

  // ── Pick the top scorer; bail if no one scores above 0 ──
  scores.sort((a, b) => b.score - a.score);
  const top = scores[0];
  if (!top || top.score <= 0) return null;

  return {
    cardId,
    suggestedUserId: top.userId,
    suggestedUserName: top.name,
    score: Math.round(top.score * 10) / 10,
    reasons: top.reasons,
  };
}
