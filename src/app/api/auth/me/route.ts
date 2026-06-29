import type { NextRequest } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { ok } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GET /api/auth/me — returns the current user or { user: null }.
export async function GET(req: NextRequest) {
  const user = await getCurrentUser(req);
  return ok({ user });
}
