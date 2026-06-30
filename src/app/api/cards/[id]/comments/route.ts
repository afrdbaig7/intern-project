import type { NextRequest } from "next/server";

import { db } from "@/lib/db";
import { toCommentDTO } from "@/lib/mappers";
import { notFound, ok } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;

  const card = await db.card.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!card) return notFound("Card not found");

  const comments = await db.comment.findMany({
    where: { cardId: id },
    include: { user: true },
    orderBy: { createdAt: "desc" },
  });
  return ok(comments.map(toCommentDTO));
}
