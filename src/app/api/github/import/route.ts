import type { NextRequest } from "next/server";

import { db } from "@/lib/db";
import { CARD_INCLUDE, toCardDTO } from "@/lib/mappers";
import { fetchOpenIssues, normalizeRepo, pickLabelColor } from "@/lib/github";
import { broadcast, err, notFound, ok, parseBody } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const body = await parseBody<{
    repo?: string;
    boardId?: string;
    columnId?: string;
    creatorId?: string;
  }>(req);

  const repoInput = (body.repo ?? "").trim();
  const boardId = (body.boardId ?? "").trim();
  const columnId = (body.columnId ?? "").trim();
  const creatorId = (body.creatorId ?? "").trim();

  if (!repoInput) return err("`repo` is required", 400);
  if (!boardId) return err("`boardId` is required", 400);
  if (!columnId) return err("`columnId` is required", 400);
  if (!creatorId) return err("`creatorId` is required", 400);

  const repo = normalizeRepo(repoInput);
  if (!repo) {
    return err(
      `Could not parse repo from "${repoInput}". Expected "owner/name" or a github.com URL.`,
      400,
    );
  }

  const [board, column, creator, members] = await Promise.all([
    db.board.findUnique({
      where: { id: boardId },
      select: { id: true },
    }),
    db.column.findUnique({
      where: { id: columnId },
      select: { id: true, boardId: true },
    }),
    db.user.findUnique({ where: { id: creatorId }, select: { id: true, name: true } }),
    db.boardMember.findMany({
      where: { boardId },
      include: { user: { select: { id: true, githubUsername: true } } },
    }),
  ]);

  if (!board) return notFound("Board not found");
  if (!column || column.boardId !== boardId) {
    return notFound("Column not found on this board");
  }
  if (!creator) return notFound("Creator user not found");

  const ghUserMap = new Map<string, string>();
  for (const m of members) {
    if (m.user.githubUsername) {
      ghUserMap.set(m.user.githubUsername.toLowerCase(), m.user.id);
    }
  }

  const fetched = await fetchOpenIssues(repo);
  if (!fetched.ok) {
    return err(fetched.error, fetched.status, { repo });
  }
  const allIssues = fetched.issues;

  const existing = await db.card.findMany({
    where: { boardId, githubRepo: repo },
    select: { githubIssueNumber: true },
  });
  const existingNumbers = new Set(
    existing
      .map((c) => c.githubIssueNumber)
      .filter((n): n is number => n != null),
  );

  const newIssues = allIssues.filter(
    (i) => !existingNumbers.has(i.number),
  );
  const skipped = allIssues.length - newIssues.length;

  if (newIssues.length === 0) {
    void broadcast(boardId, "github:imported", {
      boardId,
      repo,
      count: 0,
    });
    return ok({ imported: 0, skipped, total: allIssues.length });
  }

  const existingLabels = await db.label.findMany({ where: { boardId } });
  const labelByName = new Map(existingLabels.map((l) => [l.name, l]));

  const maxOrderRow = await db.card.aggregate({
    where: { columnId },
    _max: { order: true },
  });
  let nextOrder = (maxOrderRow._max.order ?? -1) + 1;

  let imported = 0;

  for (const issue of newIssues) {
    const labelIds: string[] = [];
    for (let li = 0; li < issue.labels.length; li++) {
      const name = issue.labels[li];
      let label = labelByName.get(name);
      if (!label) {
        try {
          label = await db.label.create({
            data: {
              boardId,
              name,
              color: pickLabelColor(li),
            },
          });
        } catch {
          label =
            (await db.label.findUnique({
              where: { boardId_name: { boardId, name } },
            })) ?? undefined;
        }
        if (label) labelByName.set(name, label);
      }
      if (label) labelIds.push(label.id);
    }

    let assigneeId: string | null = null;
    for (const login of issue.assignees) {
      const uid = ghUserMap.get(login.toLowerCase());
      if (uid) {
        assigneeId = uid;
        break;
      }
    }

    const description = `${issue.body ?? ""}${
      issue.body ? "\n\n" : ""
    }GitHub: ${issue.url}`;

    const card = await db.$transaction(async (tx) => {
      const newCard = await tx.card.create({
        data: {
          boardId,
          columnId,
          title: issue.title,
          description,
          githubIssueNumber: issue.number,
          githubRepo: repo,
          sourceUrl: issue.url,
          order: nextOrder,
          version: 1,
          creatorId,
          assigneeId,
          complexityAccepted: false,
        },
        include: CARD_INCLUDE,
      });

      if (labelIds.length > 0) {
        const uniqueLabelIds = Array.from(new Set(labelIds));
        await tx.cardLabel.createMany({
          data: uniqueLabelIds.map((labelId) => ({
            cardId: newCard.id,
            labelId,
          })),
        });
      }

      await tx.activity.create({
        data: {
          cardId: newCard.id,
          boardId,
          userId: creatorId,
          type: "created",
          summary: `${creator.name} imported issue #${issue.number} from ${repo}`,
        },
      });

      await tx.cardHistory.create({
        data: {
          cardId: newCard.id,
          boardId,
          action: "created",
          assigneeId,
          complexity: null,
          labelNames: issue.labels.join(","),
          descriptionLength: (issue.body ?? "").length,
        },
      });

      return newCard;
    });

    nextOrder += 1;
    imported += 1;

    const reloaded = await db.card.findUnique({
      where: { id: card.id },
      include: CARD_INCLUDE,
    });
    if (reloaded) {
      void broadcast(boardId, "card:created", toCardDTO(reloaded));
    }
  }

  void broadcast(boardId, "github:imported", {
    boardId,
    repo,
    count: imported,
  });

  return ok({
    imported,
    skipped,
    total: allIssues.length,
  });
}
