// Bottleneck detection — pure heuristic, no external LLM.
//
// A column is a "bottleneck" when, over the last 7 days, cards arrive but
// don't leave: arrived >= 3 AND arrived/left > 2.5. We then attribute a
// likely cause by inspecting the cards currently sitting in the column
// (overloaded assignee, stuck label, or generic accumulation).

import { PrismaClient } from "@prisma/client";
import type { BottleneckResult } from "../types";

const DAY_MS = 24 * 60 * 60 * 1000;
const LOOKBACK_DAYS = 7;
const MIN_ARRIVED = 3;
const RATIO_THRESHOLD = 2.5;
const CRITICAL_RATIO = 4;

/** Safely parse a metadata JSON string into a plain object. */
function parseMeta(raw: string | null): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

/**
 * Detect bottleneck columns on a board.
 * Returns one BottleneckResult per problematic column, sorted by ratio desc.
 */
export async function detectBottlenecks(
  db: PrismaClient,
  boardId: string
): Promise<BottleneckResult[]> {
  const since = new Date(Date.now() - LOOKBACK_DAYS * DAY_MS);

  // ── Load "moved" activities on this board over the lookback window ──
  const movedActivities = await db.activity.findMany({
    where: {
      boardId,
      type: "moved",
      createdAt: { gte: since },
    },
    select: { metadata: true },
  });

  // ── All columns on the board (we need names + ids) ──
  const columns = await db.column.findMany({
    where: { boardId },
    orderBy: { order: "asc" },
  });
  if (columns.length === 0) return [];

  // Tally arrived/left per column by parsing each moved activity's metadata.
  const stats = new Map<string, { arrived: number; left: number }>();
  for (const col of columns) stats.set(col.id, { arrived: 0, left: 0 });

  for (const a of movedActivities) {
    const meta = parseMeta(a.metadata);
    const from = typeof meta.fromColumnId === "string" ? meta.fromColumnId : null;
    const to = typeof meta.toColumnId === "string" ? meta.toColumnId : null;
    if (to && stats.has(to)) stats.get(to)!.arrived++;
    if (from && stats.has(from)) stats.get(from)!.left++;
  }

  // ── Pull every card currently on the board, with assignee + labels ──
  const cards = await db.card.findMany({
    where: { boardId },
    include: {
      assignee: { select: { id: true, name: true } },
      labels: { include: { label: { select: { name: true } } } },
    },
  });

  const results: BottleneckResult[] = [];

  for (const col of columns) {
    const s = stats.get(col.id)!;
    if (s.arrived < MIN_ARRIVED) continue;

    // Guard divide-by-zero: treat left=0 as an infinite ratio (arrived count
    // is already >= MIN_ARRIVED here, so it's clearly a bottleneck).
    const ratio = s.left === 0 ? Number.POSITIVE_INFINITY : s.arrived / s.left;
    if (ratio <= RATIO_THRESHOLD) continue;

    const colCards = cards.filter((c) => c.columnId === col.id);
    const totalCards = colCards.length;

    let likelyCause =
      "Cards are accumulating faster than they're being completed";

    // Check assignee overload first (>50% of cards owned by one person).
    const assigneeCounts = new Map<string, number>();
    for (const c of colCards) {
      if (c.assigneeId) {
        assigneeCounts.set(
          c.assigneeId,
          (assigneeCounts.get(c.assigneeId) ?? 0) + 1
        );
      }
    }
    const topAssignee = [...assigneeCounts.entries()].sort(
      (a, b) => b[1] - a[1]
    )[0];

    if (
      topAssignee &&
      totalCards > 0 &&
      topAssignee[1] / totalCards > 0.5
    ) {
      const ownerCard = colCards.find((c) => c.assigneeId === topAssignee[0]);
      const name = ownerCard?.assignee?.name ?? "Unknown";
      likelyCause = `Assignee ${name} is overloaded with ${topAssignee[1]} cards in this column`;
    } else {
      // Then check label frequency (>40% of cards share a label).
      const labelCounts = new Map<string, number>();
      for (const c of colCards) {
        for (const cl of c.labels) {
          const n = cl.label.name;
          labelCounts.set(n, (labelCounts.get(n) ?? 0) + 1);
        }
      }
      const topLabel = [...labelCounts.entries()].sort(
        (a, b) => b[1] - a[1]
      )[0];
      if (topLabel && totalCards > 0 && topLabel[1] / totalCards > 0.4) {
        likelyCause = `Label '${topLabel[0]}' keeps getting stuck here`;
      }
    }

    results.push({
      columnId: col.id,
      columnName: col.name,
      arrived: s.arrived,
      left: s.left,
      ratio: ratio === Number.POSITIVE_INFINITY ? s.arrived : ratio,
      likelyCause,
      severity: ratio > CRITICAL_RATIO ? "critical" : "warning",
    });
  }

  return results.sort((a, b) => b.ratio - a.ratio);
}
