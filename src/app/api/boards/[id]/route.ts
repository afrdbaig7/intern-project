import type { NextRequest } from "next/server";

import { db } from "@/lib/db";
import { BOARD_INCLUDE, toBoardDTO } from "@/lib/mappers";
import { err, getUser, notFound, ok, parseBody } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GET /api/boards/[id] — return BoardDTO (board + members + columns + labels,
// no cards).
export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const board = await db.board.findUnique({
    where: { id },
    include: BOARD_INCLUDE,
  });
  if (!board) return notFound("Board not found");
  return ok(toBoardDTO(board));
}

// PATCH /api/boards/[id] — update board fields.
// Body: { name?, description?, sprintStart?, sprintEnd? }
export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const [user, authErr] = await getUser(req);
  if (authErr) return authErr;
  const { id } = await ctx.params;

  const existing = await db.board.findUnique({ where: { id } });
  if (!existing) return notFound("Board not found");

  const body = await parseBody<{
    name?: string;
    description?: string | null;
    sprintStart?: string | null;
    sprintEnd?: string | null;
  }>(req);

  const data: Record<string, unknown> = {};
  if (typeof body.name === "string" && body.name.trim()) {
    data.name = body.name.trim();
  }
  if (body.description !== undefined) {
    data.description =
      typeof body.description === "string" ? body.description.trim() : null;
  }
  if (body.sprintStart !== undefined) {
    data.sprintStart = body.sprintStart ? new Date(body.sprintStart) : null;
  }
  if (body.sprintEnd !== undefined) {
    data.sprintEnd = body.sprintEnd ? new Date(body.sprintEnd) : null;
  }

  // Touch updatedAt even if no fields changed.
  data.updatedAt = new Date();

  // Use the user to silence unused warnings and to log the actor in future.
  void user;

  const updated = await db.board.update({
    where: { id },
    data,
    include: BOARD_INCLUDE,
  });
  return ok(toBoardDTO(updated));
}

// DELETE /api/boards/[id] — cascade delete.
export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const [user, authErr] = await getUser(req);
  if (authErr) return authErr;
  const { id } = await ctx.params;

  const existing = await db.board.findUnique({ where: { id } });
  if (!existing) return notFound("Board not found");

  void user;

  await db.board.delete({ where: { id } });
  return ok({ ok: true, id });
}
