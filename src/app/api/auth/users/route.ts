import { db } from "@/lib/db";
import { toUserDTO } from "@/lib/mappers";
import { ok } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GET /api/auth/users — list all users (for login screen quick-pick +
// assignment selectors). Returns UserDTO[].
export async function GET() {
  const users = await db.user.findMany({
    orderBy: { name: "asc" },
  });
  return ok(users.map(toUserDTO));
}
