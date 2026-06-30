import type { NextRequest } from "next/server";

import { db } from "@/lib/db";
import {
  BOARD_DETAIL_INCLUDE,
  toBoardDetailDTO,
} from "@/lib/mappers";
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
    include: BOARD_DETAIL_INCLUDE,
  });
  if (!board) return notFound("Board not found");
  return ok(toBoardDetailDTO(board));
}
