import type { NextRequest } from "next/server";

import { db } from "@/lib/db";
import { toActivityDTO } from "@/lib/mappers";
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

  const activities = await db.activity.findMany({
    where: { cardId: id },
    include: { user: true },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return ok(activities.map(toActivityDTO));
}
