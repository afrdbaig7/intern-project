import type { NextRequest } from "next/server";

import { db } from "@/lib/db";
import { toInsightDTO } from "@/lib/mappers";
import { notFound, ok } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;

  const board = await db.board.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!board) return notFound("Board not found");

  const insights = await db.aIInsight.findMany({
    where: { boardId: id },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return ok(insights.map(toInsightDTO));
}
