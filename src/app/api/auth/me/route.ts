import type { NextRequest } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { ok } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser(req);
  return ok({ user });
}
