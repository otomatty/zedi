import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import { eq } from "drizzle-orm";
import { auth } from "../auth.js";
import { users } from "../schema/users.js";
import type { AppEnv } from "../types/index.js";

export /**
 *
 */
const authRequired = createMiddleware<AppEnv>(async (c, next) => {
  /**
   *
   */
  let session: Awaited<ReturnType<typeof auth.api.getSession>> | null = null;
  try {
    session = await auth.api.getSession({ headers: c.req.raw.headers });
  } catch {
    session = null;
  }
  if (!session) {
    throw new HTTPException(401, { message: "Unauthorized" });
  }

  // サスペンドされたユーザーのアクセスを拒否する
  // Reject access for suspended users
  /**
   *
   */
  const db = c.get("db");
  /**
   *
   */
  const [row] = await db
    .select({ status: users.status })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);
  if (row?.status !== "active") {
    throw new HTTPException(403, { message: "Account suspended" });
  }

  c.set("userId", session.user.id);
  c.set("userEmail", session.user.email);
  await next();
});

export /**
 *
 */
const authOptional = createMiddleware<AppEnv>(async (c, next) => {
  try {
    /**
     *
     */
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (session) {
      c.set("userId", session.user.id);
      c.set("userEmail", session.user.email);
    }
  } catch {
    // No valid session — continue without auth
  }
  await next();
});
