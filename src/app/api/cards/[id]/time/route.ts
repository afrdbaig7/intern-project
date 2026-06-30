import type { NextRequest } from "next/server";

import { db } from "@/lib/db";
import {
  CARD_INCLUDE,
  buildCardTimeState,
  toCardDTO,
} from "@/lib/mappers";
import {
  broadcast,
  err,
  getUser,
  notFound,
  ok,
  parseBody,
} from "@/lib/api-helpers";
import type { CardTimeStateDTO } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Load last 20 time entries for a card (with user names). */
async function loadEntries(cardId: string) {
  return db.timeEntry.findMany({
    where: { cardId },
    include: { user: true },
    orderBy: { startedAt: "desc" },
    take: 20,
  });
}

/** Build the response payload from the current card row + entries. */
async function buildResponse(cardId: string): Promise<CardTimeStateDTO> {
  const card = await db.card.findUnique({
    where: { id: cardId },
    select: { timeLoggedSec: true, timerStartedAt: true },
  });
  if (!card) {
    return { totalSec: 0, running: false, startedAt: null, entries: [] };
  }
  const entries = await loadEntries(cardId);
  return buildCardTimeState(card, entries);
}

// GET /api/cards/[id]/time
export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const exists = await db.card.findUnique({ where: { id }, select: { id: true } });
  if (!exists) return notFound("Card not found");
  return ok(await buildResponse(id));
}

// POST /api/cards/[id]/time — start a timer for { userId }.
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const [user, authErr] = await getUser(req);
  if (authErr) return authErr;
  const { id } = await ctx.params;
  const body = await parseBody<{ userId?: string }>(req);
  const userId = body.userId ?? user.id;

  if (!userId || typeof userId !== "string") {
    return err("userId is required", 400);
  }

  const card = await db.card.findUnique({
    where: { id },
    select: { id: true, boardId: true, timerStartedAt: true },
  });
  if (!card) return notFound("Card not found");

  // Prevent duplicate open entries for this card+user.
  const openForUser = await db.timeEntry.findFirst({
    where: { cardId: id, userId, endedAt: null },
  });
  if (openForUser) {
    return err("Timer already running", 400);
  }

  const now = new Date();

  await db.$transaction(async (tx) => {
    await tx.timeEntry.create({
      data: { cardId: id, userId, startedAt: now, endedAt: null },
    });
    // Mark the card's active timer only if none is set yet — this lets the
    // first starter's clock drive the board-wide "running" indicator.
    await tx.card.update({
      where: { id },
      data: {
        timerStartedAt: card.timerStartedAt ?? now,
        version: { increment: 1 },
        lastEditedBy: user.id,
        lastEditedAt: now,
      },
    });
    await tx.activity.create({
      data: {
        cardId: id,
        boardId: card.boardId,
        userId,
        type: "updated",
        summary: `${user.name} started a timer`,
      },
    });
  });

  const updated = await db.card.findUnique({
    where: { id },
    include: CARD_INCLUDE,
  });
  if (updated) {
    void broadcast(updated.boardId, "card:updated", toCardDTO(updated));
  }

  return ok(await buildResponse(id));
}

// PATCH /api/cards/[id]/time — stop the running timer for { userId }.
export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const [user, authErr] = await getUser(req);
  if (authErr) return authErr;
  const { id } = await ctx.params;
  const body = await parseBody<{ userId?: string }>(req);
  const userId = body.userId ?? user.id;

  if (!userId || typeof userId !== "string") {
    return err("userId is required", 400);
  }

  const card = await db.card.findUnique({
    where: { id },
    select: { id: true, boardId: true, timeLoggedSec: true, timerStartedAt: true },
  });
  if (!card) return notFound("Card not found");

  const openEntry = await db.timeEntry.findFirst({
    where: { cardId: id, userId, endedAt: null },
  });
  if (!openEntry) {
    return err("No running timer for this user", 400);
  }

  const now = new Date();
  const durationSec = Math.max(
    0,
    Math.floor((now.getTime() - openEntry.startedAt.getTime()) / 1000),
  );

  // Determine whether THIS entry's start time matches the card's active
  // timerStartedAt — if so, we clear the card-level marker. (If multiple
  // users somehow have open entries — defensive — we only clear when the
  // card's marker corresponds to this entry.)
  const wasActiveTimer =
    card.timerStartedAt &&
    card.timerStartedAt.getTime() === openEntry.startedAt.getTime();

  await db.$transaction(async (tx) => {
    await tx.timeEntry.update({
      where: { id: openEntry.id },
      data: { endedAt: now, durationSec },
    });
    await tx.card.update({
      where: { id },
      data: {
        timeLoggedSec: { increment: durationSec },
        timerStartedAt: wasActiveTimer ? null : undefined,
        version: { increment: 1 },
        lastEditedBy: user.id,
        lastEditedAt: now,
      },
    });
    await tx.activity.create({
      data: {
        cardId: id,
        boardId: card.boardId,
        userId,
        type: "updated",
        summary: `${user.name} logged ${formatDurationShort(durationSec)}`,
      },
    });
  });

  const updated = await db.card.findUnique({
    where: { id },
    include: CARD_INCLUDE,
  });
  if (updated) {
    void broadcast(updated.boardId, "card:updated", toCardDTO(updated));
  }

  return ok(await buildResponse(id));
}

/** Compact duration string used for activity summaries ("12m 3s"). */
function formatDurationShort(totalSec: number): string {
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  if (m === 0) return `${s}s`;
  return `${m}m ${s}s`;
}
