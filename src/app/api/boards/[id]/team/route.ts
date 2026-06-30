import type { NextRequest } from "next/server";

import { db } from "@/lib/db";
import { toUserDTO } from "@/lib/mappers";
import { notFound, ok } from "@/lib/api-helpers";
import type { TeamMemberStats } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;

  const board = await db.board.findUnique({
    where: { id },
    include: {
      members: { include: { user: true } },
      columns: true,
    },
  });
  if (!board) return notFound("Board not found");

  const doneColumnIds = board.columns.filter((c) => c.isDone).map((c) => c.id);
  const nonDoneColumnIds = board.columns
    .filter((c) => !c.isDone)
    .map((c) => c.id);

  const sinceDate = board.sprintStart
    ? board.sprintStart
    : new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);

  const stats: TeamMemberStats[] = await Promise.all(
    board.members.map(async (m) => {
      const user = toUserDTO(m.user);

      const [inProgressCount, completedThisSprint, completedHistory] =
        await Promise.all([
          db.card.count({
            where: {
              assigneeId: m.userId,
              boardId: id,
              columnId: { in: nonDoneColumnIds },
            },
          }),
          db.card.count({
            where: {
              assigneeId: m.userId,
              boardId: id,
              columnId: { in: doneColumnIds },
              completedAt: { gte: sinceDate },
            },
          }),
          db.cardHistory.findMany({
            where: {
              boardId: id,
              action: "completed",
              assigneeId: m.userId,
            },
            select: { labelNames: true },
          }),
        ]);

      const labelCounts = new Map<string, number>();
      for (const h of completedHistory) {
        if (!h.labelNames) continue;
        for (const name of h.labelNames.split(",")) {
          const n = name.trim();
          if (!n) continue;
          labelCounts.set(n, (labelCounts.get(n) ?? 0) + 1);
        }
      }
      const labelSpecialisation = Array.from(labelCounts.entries())
        .map(([label, count]) => ({ label, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

      return {
        user,
        inProgressCount,
        completedThisSprint,
        labelSpecialisation,
      };
    }),
  );

  return ok(stats);
}
