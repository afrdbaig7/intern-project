import type { NextRequest } from "next/server";

import { db } from "@/lib/db";
import { notFound, ok, triggerAI } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;

  const board = await db.board.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!board) return notFound("Board not found");

  void triggerAI(id);

  return ok({ ok: true, message: "AI analysis triggered" });
}
