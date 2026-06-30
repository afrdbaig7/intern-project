import type { NextRequest } from "next/server";

import { db } from "@/lib/db";
import { CARD_INCLUDE, toCardDTO } from "@/lib/mappers";
import { getCurrentUser } from "@/lib/auth";
import { inferComplexityForCard } from "@/lib/ai-loader";
import {
  broadcast,
  err,
  notFound,
  ok,
  parseBody,
} from "@/lib/api-helpers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const body = await parseBody<{
    title?: string;
    description?: string | null;
    sourceUrl?: string | null;
    boardId?: string;
    columnId?: string;
    creatorId?: string | null;
  }>(req);

  const title = (body.title ?? "").trim();
  const boardId = (body.boardId ?? "").trim();
  const columnId = (body.columnId ?? "").trim();

  if (!title) return err("title is required", 400);
  if (!boardId) return err("boardId is required", 400);
  if (!columnId) return err("columnId is required", 400);

  const column = await db.column.findUnique({
    where: { id: columnId },
    include: { board: { include: { members: true } } },
  });
  if (!column || column.boardId !== boardId) {
    return notFound("Board or column not found");
  }

  let creatorId = body.creatorId ?? null;
  if (!creatorId) {
    const cookieUser = await getCurrentUser(req);
    if (cookieUser) creatorId = cookieUser.id;
  }
  if (!creatorId) {
    const firstMember = column.board.members[0];
    if (!firstMember) {
      return err("Board has no members; cannot resolve creator", 400);
    }
    creatorId = firstMember.userId;
  }
  const creator = await db.user.findUnique({ where: { id: creatorId } });
  if (!creator) {
    return err(`User ${creatorId} does not exist`, 400);
  }

  const maxOrderRow = await db.card.aggregate({
    where: { columnId },
    _max: { order: true },
  });
  const nextOrder = (maxOrderRow._max.order ?? -1) + 1;

  const created = await db.$transaction(async (tx) => {
    const card = await tx.card.create({
      data: {
        boardId,
        columnId,
        title,
        description: body.description ?? null,
        sourceUrl: body.sourceUrl ?? null,
        order: nextOrder,
        version: 1,
        creatorId,
        complexityAccepted: false,
      },
      include: CARD_INCLUDE,
    });

    await tx.activity.create({
      data: {
        cardId: card.id,
        boardId,
        userId: creatorId,
        type: "created",
        summary: `${creator.name} created this card`,
      },
    });

    await tx.cardHistory.create({
      data: {
        cardId: card.id,
        boardId,
        action: "created",
        assigneeId: null,
        complexity: null,
        labelNames: null,
        descriptionLength: (body.description ?? "").length,
      },
    });

    return card;
  });

  void broadcast(boardId, "card:created", toCardDTO(created));

  try {
    const suggestion = await inferComplexityForCard(db, created.id);

    if (suggestion && typeof suggestion.complexity === "number") {
      const updated = await db.card.update({
        where: { id: created.id },
        data: {
          complexity: suggestion.complexity,
          complexityAccepted: false,
          version: created.version + 1,
          lastEditedBy: null, // AI suggestion — no human editor
          lastEditedAt: new Date(),
        },
        include: CARD_INCLUDE,
      });

      void broadcast(boardId, "card:updated", toCardDTO(updated));

      void broadcast(boardId, "ai:insight", {
        type: "complexity",
        severity: "info",
        title: `Complexity suggestion: ${suggestion.complexity}`,
        message: `AI suggests complexity ${suggestion.complexity} (confidence ${Math.round(
          suggestion.confidence * 100,
        )}%). Reasons: ${suggestion.reasons.join("; ")}`,
        cardId: updated.id,
        complexity: suggestion.complexity,
        confidence: suggestion.confidence,
        reasons: suggestion.reasons,
      });

      return ok(toCardDTO(updated));
    }
  } catch (e) {
    console.warn("[clip] AI inference failed:", (e as Error).message);
  }

  return ok(toCardDTO(created));
}
