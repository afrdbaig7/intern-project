import { NextResponse, type NextRequest } from "next/server";

import { db } from "@/lib/db";
import { AUTH_COOKIE, AUTH_COOKIE_MAX_AGE } from "@/lib/auth";
import { toUserDTO } from "@/lib/mappers";
import { err, parseBody } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// POST /api/auth/login
// Body: { email }
// Sets an httpOnly cookie `kb_user=<userId>` (7 days) and returns the UserDTO.
export async function POST(req: NextRequest) {
  const body = await parseBody<{ email?: string }>(req);
  const email = (body.email ?? "").trim().toLowerCase();

  if (!email) {
    return err("Email is required", 400);
  }

  const user = await db.user.findUnique({ where: { email } });
  if (!user) {
    return err(`No user found for ${email}`, 404);
  }

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
