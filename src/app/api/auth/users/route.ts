import { db } from "@/lib/db";
import { toUserDTO } from "@/lib/mappers";
import { ok } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const users = await db.user.findMany({
    orderBy: { name: "asc" },
  });
  return ok(users.map(toUserDTO));
}
