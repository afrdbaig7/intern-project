import type { NextRequest } from "next/server";

import { db } from "@/lib/db";
import { toInsightDTO } from "@/lib/mappers";
import { err, notFound, ok, parseBody } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string; insightId: string }> },
) {
  const { id, insightId } = await ctx.params;

  const body = await parseBody<{ read?: boolean }>(req);
  if (typeof body.read !== "boolean") {
    return err("`read` (boolean) is required", 400);
  }

  const existing = await db.aIInsight.findUnique({
    where: { id: insightId },
  });
  if (!existing || existing.boardId !== id) {
    return notFound("Insight not found");
  }

  const updated = await db.aIInsight.update({
    where: { id: insightId },
    data: { read: body.read },
  });
  return ok(toInsightDTO(updated));
}
