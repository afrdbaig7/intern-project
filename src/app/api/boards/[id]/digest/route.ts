import type { NextRequest } from "next/server";

import { db } from "@/lib/db";
import { toDigestDTO } from "@/lib/mappers";
import { ok } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;

  const latest = await db.digest.findFirst({
    where: { boardId: id },
    orderBy: { createdAt: "desc" },
  });
  return ok(latest ? toDigestDTO(latest) : null);
}
