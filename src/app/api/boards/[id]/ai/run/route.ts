import type { NextRequest } from "next/server";

import { db } from "@/lib/db";
import { notFound, ok, triggerAI } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// POST /api/boards/[id]/ai/run — trigger an on-demand AI analysis for the
// board. Calls the Socket.IO mini-service internal endpoint, which runs the
// heuristics and broadcasts results.
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

  // Fire-and-forget the AI run. Failures are swallowed inside triggerAI so
  // the API still returns 200 (the run is best-effort).
  void triggerAI(id);

  return ok({ ok: true, message: "AI analysis triggered" });
}
