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

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GET /api/cards/[id] — return a single card with full relations
// (assignee, creator, labels).
export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const card = await db.card.findUnique({
    where: { id },
    include: CARD_INCLUDE,
  });
  if (!card) return notFound("Card not found");
  return ok(toCardDTO(card));
}

// PATCH /api/cards/[id]
// Body: { complexity?, complexityAccepted?, assigneeId? }
// REST fallback for the detail modal's accept/override complexity + assign
// actions when the socket isn't being used. Increments version, creates an
// Activity row ("complexity_set" when complexityAccepted becomes true, else
// "updated" or "assigned" when assigneeId changes), then broadcasts
// `card:updated` to the board's socket room.
export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const [user, authErr] = await getUser(req);
  if (authErr) return authErr;
  const { id } = await ctx.params;

  const existing = await db.card.findUnique({
    where: { id },
    include: CARD_INCLUDE,
  });
  if (!existing) return notFound("Card not found");

  const body = await parseBody<{
    complexity?: number | null;
    complexityAccepted?: boolean;
    assigneeId?: string | null;
  }>(req);

  const data: Record<string, unknown> = {};
  const activityQueue: { type: string; summary: string }[] = [];

  if (body.complexity !== undefined) {
    const c = body.complexity;
    if (c !== null && (typeof c !== "number" || c < 1 || c > 5)) {
      return err("complexity must be 1-5 or null", 400);
    }
    data.complexity = c;
  }

  if (typeof body.complexityAccepted === "boolean") {
    data.complexityAccepted = body.complexityAccepted;
    if (body.complexityAccepted && existing.complexityAccepted !== true) {
      activityQueue.push({
        type: "complexity_set",
        summary: `${user.name} accepted complexity ${
          body.complexity ?? existing.complexity ?? "?"
        }`,
      });
    }
  }

  if (body.assigneeId !== undefined) {
    if (
      body.assigneeId !== null &&
      typeof body.assigneeId === "string" &&
      body.assigneeId !== existing.assigneeId
    ) {
      // Validate membership
      const membership = await db.boardMember.findUnique({
        where: {
          boardId_userId: {
            boardId: existing.boardId,
            userId: body.assigneeId,
          },
        },
      });
      if (!membership) {
        return err("Assignee is not a board member", 400);
      }
    }
    data.assigneeId = body.assigneeId ?? null;
    if (body.assigneeId !== existing.assigneeId) {
      const assignee =
        body.assigneeId && body.assigneeId !== null
          ? await db.user.findUnique({ where: { id: body.assigneeId } })
          : null;
      activityQueue.push({
        type: "assigned",
        summary: assignee
          ? `Assigned to ${assignee.name}`
          : `${user.name} unassigned this card`,
      });
    }
  }

  // Always bump version for optimistic concurrency.
  data.version = existing.version + 1;
  data.lastEditedBy = user.id;
  data.lastEditedAt = new Date();

  const updated = await db.$transaction(async (tx) => {
    const card = await tx.card.update({
      where: { id },
      data,
      include: CARD_INCLUDE,
    });
    if (activityQueue.length === 0 && body.complexity !== undefined) {
      // No specific activity type — at least log an "updated".
      activityQueue.push({
        type: "updated",
        summary: `${user.name} updated this card`,
      });
    }
    for (const a of activityQueue) {
      await tx.activity.create({
        data: {
          cardId: id,
          boardId: card.boardId,
          userId: user.id,
          type: a.type,
          summary: a.summary,
        },
      });
    }
    return card;
  });

  // Best-effort broadcast — never break the REST write on a dead socket svc.
  void broadcast(updated.boardId, "card:updated", toCardDTO(updated));

  return ok(toCardDTO(updated));
}
