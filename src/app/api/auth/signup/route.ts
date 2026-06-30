import { NextResponse, type NextRequest } from "next/server";

import { db } from "@/lib/db";
import {
  AUTH_COOKIE,
  AUTH_COOKIE_MAX_AGE,
  hashPassword,
  isValidEmail,
} from "@/lib/auth";
import { toUserDTO } from "@/lib/mappers";
import { err, parseBody } from "@/lib/api-helpers";
import { BOARD_TEMPLATES } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const AVATAR_COLORS = [
  "#6366f1", "#ec4899", "#14b8a6", "#f59e0b", "#8b5cf6",
  "#ef4444", "#0ea5e9", "#22c55e", "#d946ef", "#f97316",
];

// POST /api/auth/signup
// Body: { name, email, password }
// Creates a user with a bcrypt-hashed password, gives them a default board
// (from the Software Sprint template) so they immediately see a populated
// board, sets the auth cookie, and returns { user: UserDTO }.
export async function POST(req: NextRequest) {
  const body = await parseBody<{ name?: string; email?: string; password?: string }>(req);
  const name = (body.name ?? "").trim();
  const email = (body.email ?? "").trim().toLowerCase();
  const password = body.password ?? "";

  if (!name || name.length < 2) {
    return err("Please enter your name (at least 2 characters).", 400);
  }
  if (!email || !isValidEmail(email)) {
    return err("Please enter a valid email address.", 400);
  }
  if (!password || password.length < 6) {
    return err("Password must be at least 6 characters long.", 400);
  }

  // Check for an existing account.
  const existing = await db.user.findUnique({ where: { email } });
  if (existing) {
    return err("An account with that email already exists. Try signing in instead.", 409);
  }

  const passwordHash = hashPassword(password);
  const avatarColor = AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];

  // Create the user + a default board from the Software Sprint template in one
  // transaction so a failure rolls everything back.
  const user = await db.$transaction(async (tx) => {
    const newUser = await tx.user.create({
      data: { name, email, avatarColor, passwordHash },
    });

    // Instantiate the Software Sprint template for the new user.
    const tpl = BOARD_TEMPLATES.find((t) => t.id === "software-sprint") ?? BOARD_TEMPLATES[0];
    const board = await tx.board.create({
      data: {
        name: `${name.split(" ")[0]}'s Sprint Board`,
        description: "Your personal board — created from the Software Sprint template.",
        template: tpl.id,
      },
    });

    await tx.boardMember.create({
      data: { boardId: board.id, userId: newUser.id, role: "owner" },
    });

    // Columns
    const columns = await Promise.all(
      tpl.columns.map((c, i) =>
        tx.column.create({ data: { boardId: board.id, name: c.name, color: c.color, order: i, isDone: c.isDone } })
      )
    );

    // Labels
    await Promise.all(
      tpl.labels.map((l) => tx.label.create({ data: { boardId: board.id, name: l.name, color: l.color } }))
    );

    // Sample cards (so the board isn't empty)
    if (tpl.sampleCards) {
      for (let i = 0; i < tpl.sampleCards.length; i++) {
        const sc = tpl.sampleCards[i];
        await tx.card.create({
          data: {
            boardId: board.id,
            columnId: columns[sc.column].id,
            title: sc.title,
            description: sc.description,
            order: i,
            creatorId: newUser.id,
            version: 1,
          },
        });
      }
    }

    return newUser;
  });

  const res = NextResponse.json({ user: toUserDTO(user) });
  res.cookies.set({
    name: AUTH_COOKIE,
    value: user.id,
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: AUTH_COOKIE_MAX_AGE,
  });
  return res;
}
