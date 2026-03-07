import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import { eq } from "drizzle-orm";
import { users } from "../schema/users.js";
import type { AppEnv } from "../types/index.js";

/**
 * Requires a valid session (authRequired must run first) and user.role === 'admin'.
 * Use after authRequired on /api/admin/* routes.
 */
export const adminRequired = createMiddleware<AppEnv>(async (c, next) => {
  const userId = c.get("userId");
  const db = c.get("db");
  const row = await db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const role = row[0]?.role ?? null;
  if (role !== "admin") {
    throw new HTTPException(403, { message: "Forbidden: admin access required" });
  }
  await next();
});
