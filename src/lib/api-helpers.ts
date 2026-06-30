
import { NextResponse, type NextRequest } from "next/server";

import { getCurrentUser } from "./auth";
import type { UserDTO } from "./types";

export function ok<T>(data: T, init?: ResponseInit): NextResponse<T> {
  return NextResponse.json(data, init);
}

export function err(
  message: string,
  status = 400,
  extra?: Record<string, unknown>,
): NextResponse {
  return NextResponse.json({ error: message, ...extra }, { status });
}

export async function parseBody<T = Record<string, unknown>>(
  req: NextRequest,
): Promise<T> {
  try {
    const text = await req.text();
    if (!text) return {} as T;
    return JSON.parse(text) as T;
  } catch {
    return {} as T;
  }
}

/**
 * Returns the current user or THROWS a NextResponse (status 401). Callers
 * should wrap in try/catch and return the thrown value verbatim.
 *
 *   try {
 *     const user = await requireUser(req)
 *     ...
 *   } catch (e) {
 *     return e as NextResponse
 *   }
 */
export async function requireUser(req: NextRequest): Promise<UserDTO> {
  const user = await getCurrentUser(req);
  if (!user) {
    throw err("Unauthorized", 401);
  }
  return user;
}

/**
 * Convenience wrapper: returns `[user, null]` on success or
 * `[null, errorResponse]` on failure. Avoids try/catch in callers.
 */
export async function getUser(
  req: NextRequest,
): Promise<[UserDTO, null] | [null, NextResponse]> {
  try {
    const user = await requireUser(req);
    return [user, null];
  } catch (e) {
    return [null, e as NextResponse];
  }
}

const SOCKET_SERVICE_BASE = "http://localhost:3003";

/**
 * Broadcast an event to all clients watching a board via the Socket.IO
 * mini-service's internal HTTP endpoint. Failures are swallowed so a dead
 * socket service never breaks a REST write.
 */
export async function broadcast(
  boardId: string,
  event: string,
  payload: unknown,
): Promise<void> {
  try {
    await fetch(`${SOCKET_SERVICE_BASE}/internal/broadcast`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ boardId, event, payload }),
      signal: AbortSignal.timeout(3000),
    });
  } catch (e) {
    console.warn(
      `[broadcast] socket service unreachable:`,
      (e as Error).message,
    );
  }
}

/**
 * Trigger an on-demand AI run for a board via the socket service's
 * internal endpoint. Failures are swallowed.
 */
export async function triggerAI(boardId: string): Promise<void> {
  try {
    await fetch(`${SOCKET_SERVICE_BASE}/internal/ai-run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ boardId }),
      signal: AbortSignal.timeout(5000),
    });
  } catch (e) {
    console.warn(
      `[triggerAI] socket service unreachable:`,
      (e as Error).message,
    );
  }
}

export function notFound(message = "Not found"): NextResponse {
  return err(message, 404);
}

export function badRequest(message: string): NextResponse {
  return err(message, 400);
}
