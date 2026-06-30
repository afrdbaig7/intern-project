import type { NextRequest } from "next/server";

import { db } from "@/lib/db";
import {
  BOARD_INCLUDE,
  toBoardDTO,
} from "@/lib/mappers";
import { BOARD_TEMPLATES, type BoardTemplate } from "@/lib/types";
import { err, getUser, ok, parseBody } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const boards = await db.board.findMany({
    include: BOARD_INCLUDE,
    orderBy: { updatedAt: "desc" },
  });
  return ok(boards.map(toBoardDTO));
}

export async function POST(req: NextRequest) {
  const [user, authErr] = await getUser(req);
  if (authErr) return authErr;

  const body = await parseBody<{
    name?: string;
    description?: string | null;
    templateId?: string | null;
  }>(req);

  const name = (body.name ?? "").trim();
  if (!name) {
    return err("Board name is required", 400);
  }
  const description = body.description?.trim() || null;
  const templateId = body.templateId ?? null;
  const template: BoardTemplate | null =
    templateId && BOARD_TEMPLATES.some((t) => t.id === templateId)
      ? (BOARD_TEMPLATES.find((t) => t.id === templateId) as BoardTemplate)
      : null;

  const board = await db.$transaction(async (tx) => {
    const board = await tx.board.create({
      data: {
        name,
        description,
        template: template?.id ?? null,
      },
    });

    await tx.boardMember.create({
      data: { boardId: board.id, userId: user.id, role: "owner" },
    });

    const columnDefs = template
      ? template.columns.map((c, i) => ({
          name: c.name,
          color: c.color,
          isDone: c.isDone,
          order: i,
        }))
      : [
          { name: "Backlog", color: "#64748b", isDone: false, order: 0 },
          { name: "To Do", color: "#0ea5e9", isDone: false, order: 1 },
          { name: "In Progress", color: "#f59e0b", isDone: false, order: 2 },
          { name: "Done", color: "#22c55e", isDone: true, order: 3 },
        ];

    const columns = await Promise.all(
      columnDefs.map((c) =>
        tx.column.create({ data: { ...c, boardId: board.id } }),
      ),
    );

    const labelDefs = template
      ? template.labels.map((l) => ({ name: l.name, color: l.color }))
      : [
          { name: "bug", color: "#ef4444" },
          { name: "feature", color: "#3b82f6" },
          { name: "refactor", color: "#a855f7" },
        ];
    await Promise.all(
      labelDefs.map((l) =>
        tx.label.create({ data: { ...l, boardId: board.id } }),
      ),
    );

    if (template?.sampleCards?.length) {
      await Promise.all(
        template.sampleCards.map((sc, i) =>
          tx.card
            .create({
              data: {
                boardId: board.id,
                columnId: columns[sc.column]?.id ?? columns[0].id,
                title: sc.title,
                description: sc.description,
                order: i,
                complexity: 2,
                complexityAccepted: false,
                creatorId: user.id,
                version: 1,
              },
            })
            .then((card) =>
              tx.activity.create({
                data: {
                  cardId: card.id,
                  boardId: board.id,
                  userId: user.id,
                  type: "created",
                  summary: `${user.name} created this card`,
                },
              }),
            ),
        ),
      );
    }

    return board;
  });

  const full = await db.board.findUnique({
    where: { id: board.id },
    include: BOARD_INCLUDE,
  });
  if (!full) {
    return err("Failed to load created board", 500);
  }
  return ok(toBoardDTO(full));
}
