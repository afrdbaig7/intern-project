
import type { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "./db";
import { toUserDTO } from "./mappers";
import type { UserDTO } from "./types";

export const AUTH_COOKIE = "kb_user";
export const AUTH_COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

const BCRYPT_ROUNDS = 10;

/** Hash a plaintext password with bcrypt. */
export function hashPassword(plain: string): string {
  return bcrypt.hashSync(plain, BCRYPT_ROUNDS);
}

/** Verify a plaintext password against a stored bcrypt hash. */
export function verifyPassword(plain: string, hash: string): boolean {
  if (!hash || !hash.startsWith("$2")) return false;
  try {
    return bcrypt.compareSync(plain, hash);
  } catch {
    return false;
  }
}

/** Basic email format check. */
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * Reads the `kb_user` cookie from the request and loads the matching user.
 * Returns null if no cookie, no user, or any error.
 */
export async function getCurrentUser(
  req: NextRequest,
): Promise<UserDTO | null> {
  try {
    const userId = req.cookies.get(AUTH_COOKIE)?.value;
    if (!userId) return null;
    const user = await db.user.findUnique({ where: { id: userId } });
    if (!user) return null;
    return toUserDTO(user);
  } catch {
    return null;
  }
}

/**
 * Same as getCurrentUser but reads the cookie from a raw cookie header string.
 * Useful for places where we don't have a NextRequest (e.g. socket service).
 */
export async function getCurrentUserFromCookieHeader(
  cookieHeader: string | null,
): Promise<UserDTO | null> {
  if (!cookieHeader) return null;
  const match = cookieHeader
    .split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith(`${AUTH_COOKIE}=`));
  if (!match) return null;
  const userId = decodeURIComponent(match.split("=")[1] ?? "");
  if (!userId) return null;
  const user = await db.user.findUnique({ where: { id: userId } });
  return user ? toUserDTO(user) : null;
}
