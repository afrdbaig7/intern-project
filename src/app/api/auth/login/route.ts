import { NextResponse, type NextRequest } from "next/server";

import { db } from "@/lib/db";
import {
  AUTH_COOKIE,
  AUTH_COOKIE_MAX_AGE,
  isValidEmail,
  verifyPassword,
} from "@/lib/auth";
import { toUserDTO } from "@/lib/mappers";
import { err, parseBody } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const body = await parseBody<{ email?: string; password?: string }>(req);
  const email = (body.email ?? "").trim().toLowerCase();
  const password = body.password ?? "";

  if (!email) return err("Email is required", 400);
  if (!isValidEmail(email)) return err("Please enter a valid email address", 400);
  if (!password) return err("Password is required", 400);

  const user = await db.user.findUnique({ where: { email } });
  if (!user || !user.passwordHash) {
    return err("No account found for that email. Try signing up instead.", 404);
  }

  if (!verifyPassword(password, user.passwordHash)) {
    return err("Incorrect password. Please try again.", 401);
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
