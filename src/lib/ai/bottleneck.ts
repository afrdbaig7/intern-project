
import { PrismaClient } from "@prisma/client";
import type { BottleneckResult } from "../types";

const DAY_MS = 24 * 60 * 60 * 1000;
const LOOKBACK_DAYS = 7;
const MIN_ARRIVED = 3;
const RATIO_THRESHOLD = 2.5;
const CRITICAL_RATIO = 4;

const DEP_WARNING_THRESHOLD = 2; // blocks >= 2 → warning
const DEP_CRITICAL_THRESHOLD = 4; // blocks >= 4 → critical

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

  const movedActivities = await db.activity.findMany({
    where: {
      boardId,
      type: "moved",
      createdAt: { gte: since },
    },
    select: { metadata: true },
  });

  const columns = await db.column.findMany({
    where: { boardId },
    orderBy: { order: "asc" },
  });
  if (columns.length === 0) return [];

  const stats = new Map<string, { arrived: number; left: number }>();
  for (const col of columns) stats.set(col.id, { arrived: 0, left: 0 });

  for (const a of movedActivities) {
    const meta = parseMeta(a.metadata);
    const from = typeof meta.fromColumnId === "string" ? meta.fromColumnId : null;
    const to = typeof meta.toColumnId === "string" ? meta.toColumnId : null;
    if (to && stats.has(to)) stats.get(to)!.arrived++;
    if (from && stats.has(from)) stats.get(from)!.left++;
  }

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

    const ratio = s.left === 0 ? Number.POSITIVE_INFINITY : s.arrived / s.left;
    if (ratio <= RATIO_THRESHOLD) continue;

    const colCards = cards.filter((c) => c.columnId === col.id);
    const totalCards = colCards.length;

    let likelyCause =
      "Cards are accumulating faster than they're being completed";

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
      kind: "column",
      columnId: col.id,
      columnName: col.name,
      arrived: s.arrived,
      left: s.left,
      ratio: ratio === Number.POSITIVE_INFINITY ? s.arrived : ratio,
      likelyCause,
      severity: ratio > CRITICAL_RATIO ? "critical" : "warning",
    });
  }

  try {
    const doneColIds = new Set(
      columns.filter((c) => c.isDone).map((c) => c.id),
    );

    const edges = await db.cardDependency.findMany({
      where: { blocker: { boardId } },
      select: { blockerId: true, blockedId: true },
    });

    const blockingCount = new Map<string, number>();
    for (const e of edges) {
      blockingCount.set(e.blockerId, (blockingCount.get(e.blockerId) ?? 0) + 1);
    }
    if (blockingCount.size === 0) {
      return results.sort((a, b) => b.ratio - a.ratio);
    }

    const cardById = new Map(cards.map((c) => [c.id, c]));

    for (const [blockerId, count] of blockingCount) {
      if (count < DEP_WARNING_THRESHOLD) continue;
      const blocker = cardById.get(blockerId);
      if (!blocker) continue;
      if (doneColIds.has(blocker.columnId)) continue;

      const blockerCol = columns.find((c) => c.id === blocker.columnId);
      const colName = blockerCol?.name ?? "Unknown";
      const severity: "warning" | "critical" =
        count >= DEP_CRITICAL_THRESHOLD ? "critical" : "warning";

      results.push({
        kind: "dependency",
        columnId: blocker.columnId,
        columnName: colName,
        cardId: blocker.id,
        cardTitle: blocker.title,
        arrived: count,
        left: 0,
        ratio: count,
        likelyCause: `Card "${blocker.title}" is blocking ${count} downstream tasks. Completing it would unblock the chain.`,
        severity,
      });
    }
  } catch (depErr) {
    console.error("[ai] dependency bottleneck detection failed:", depErr);
  }

  return results.sort((a, b) => b.ratio - a.ratio);
}
