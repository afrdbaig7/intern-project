import type { NextRequest } from "next/server";

import { db } from "@/lib/db";
import { CARD_INCLUDE, toCardDTO } from "@/lib/mappers";
import {
  broadcast,
  err,
  getUser,
  notFound,
  ok,
  parseBody,
} from "@/lib/api-helpers";
import type { CardDependenciesDTO } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Load the (blockers, blocked) pair for a card with full CARD_INCLUDE
 * relations so the response cards can be rendered in the modal.
 */
async function loadDependencies(cardId: string): Promise<CardDependenciesDTO> {
  const card = await db.card.findUnique({
    where: { id: cardId },
    include: {
      dependenciesAsBlocker: {
        include: { blocked: { include: CARD_INCLUDE } },
      },
      dependenciesAsBlocked: {
        include: { blocker: { include: CARD_INCLUDE } },
      },
    },
  });
  if (!card) {
    return { blockers: [], blocked: [] };
  }
  return {
    blockers: card.dependenciesAsBlocked.map((d) => toCardDTO(d.blocker)),
    blocked: card.dependenciesAsBlocker.map((d) => toCardDTO(d.blocked)),
  };
}

// GET /api/cards/[id]/dependencies — { blockers, blocked }
export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const exists = await db.card.findUnique({ where: { id }, select: { id: true } });
  if (!exists) return notFound("Card not found");
  return ok(await loadDependencies(id));
}

// POST /api/cards/[id]/dependencies
// Body: { blockerId } — mark `id` as blocked by `blockerId`.
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const [user, authErr] = await getUser(req);
  if (authErr) return authErr;
  const { id } = await ctx.params;
  const body = await parseBody<{ blockerId?: string }>(req);
  const blockerId = body.blockerId;

  if (!blockerId || typeof blockerId !== "string") {
    return err("blockerId is required", 400);
  }
  if (blockerId === id) {
    return err("A card cannot block itself", 400);
  }

  const blockedCard = await db.card.findUnique({
    where: { id },
    select: { id: true, boardId: true },
  });
  if (!blockedCard) return notFound("Card not found");

  const blockerCard = await db.card.findUnique({
    where: { id: blockerId },
    select: { id: true, boardId: true },
  });
  if (!blockerCard) return notFound("Blocker card not found");

  if (blockedCard.boardId !== blockerCard.boardId) {
    return err("Both cards must be on the same board", 400);
  }

  // Duplicate check (the @@unique will also catch it, but we want a 409).
  const existing = await db.cardDependency.findUnique({
    where: { blockerId_blockedId: { blockerId, blockedId: id } },
  });
  if (existing) {
    return err("This dependency already exists", 409);
  }

  // Cycle guard: if `blocker` is already (transitively) blocked by `id`,
  // creating this edge would form a cycle. Simple 1-hop + 2-hop check is
  // enough in practice — a full DFS is overkill for a Kanban board.
  const reverseExisting = await db.cardDependency.findUnique({
    where: { blockerId_blockedId: { blockerId: id, blockedId: blockerId } },
  });
  if (reverseExisting) {
    return err(
      "Cannot create a circular dependency: the blocker is already blocked by this card",
      400,
    );
  }

  await db.cardDependency.create({
    data: { blockerId, blockedId: id },
  });

  // Bump version on the blocked card so optimistic-concurrency clients can
  // reconcile. Persist an Activity row as well.
  const updated = await db.$transaction(async (tx) => {
    const card = await tx.card.update({
      where: { id },
      data: {
        version: { increment: 1 },
        lastEditedBy: user.id,
        lastEditedAt: new Date(),
      },
      include: CARD_INCLUDE,
    });
    await tx.activity.create({
      data: {
        cardId: id,
        boardId: card.boardId,
        userId: user.id,
        type: "updated",
        summary: `${user.name} added a blocker`,
      },
    });
    return card;
  });

  // Broadcast the updated blocked card so the board/modal stays in sync.
  void broadcast(updated.boardId, "card:updated", toCardDTO(updated));

  return ok(await loadDependencies(id));
}

// DELETE /api/cards/[id]/dependencies
// Body: { blockerId } — remove the dependency where `id` was blocked by `blockerId`.
export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const [user, authErr] = await getUser(req);
  if (authErr) return authErr;
  const { id } = await ctx.params;
  const body = await parseBody<{ blockerId?: string }>(req);
  const blockerId = body.blockerId;

  if (!blockerId || typeof blockerId !== "string") {
    return err("blockerId is required", 400);
  }

  const dep = await db.cardDependency.findUnique({
    where: { blockerId_blockedId: { blockerId, blockedId: id } },
  });
  if (!dep) return notFound("Dependency not found");

  await db.cardDependency.delete({
    where: { blockerId_blockedId: { blockerId, blockedId: id } },
  });

  const updated = await db.$transaction(async (tx) => {
    const card = await tx.card.update({
      where: { id },
      data: {
        version: { increment: 1 },
        lastEditedBy: user.id,
        lastEditedAt: new Date(),
      },
      include: CARD_INCLUDE,
    });
    await tx.activity.create({
      data: {
        cardId: id,
        boardId: card.boardId,
        userId: user.id,
        type: "updated",
        summary: `${user.name} removed a blocker`,
      },
    });
    return card;
  });

  void broadcast(updated.boardId, "card:updated", toCardDTO(updated));

  return ok(await loadDependencies(id));
}
