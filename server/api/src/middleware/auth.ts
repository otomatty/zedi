import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import { eq } from "drizzle-orm";
import { auth } from "../auth.js";
import { users } from "../schema/users.js";
import type { AppEnv } from "../types/index.js";

/**
 * セッション認証を要求するミドルウェア。
 * サスペンドされたユーザーのアクセスも拒否する（DB がコンテキストにある場合）。
 *
 * Middleware that requires a valid session. Also rejects suspended users
 * when the database is available on the context (set by dbMiddleware).
 */
export const authRequired = createMiddleware<AppEnv>(async (c, next) => {
  let session: Awaited<ReturnType<typeof auth.api.getSession>> | null = null;
  try {
    session = await auth.api.getSession({ headers: c.req.raw.headers });
  } catch {
    session = null;
  }
  if (!session) {
    throw new HTTPException(401, { message: "Unauthorized" });
  }

  c.set("userId", session.user.id);
  c.set("userEmail", session.user.email);

  // サスペンドされたユーザーのアクセスを拒否する。
  // dbMiddleware がセットした Drizzle DB インスタンスを使い、ステータスを検証する。
  // Reject suspended users using the Drizzle DB instance set by dbMiddleware.
  const db = c.get("db");
  if (db && typeof db.select === "function") {
    const [row] = await db
      .select({ status: users.status })
      .from(users)
      .where(eq(users.id, session.user.id))
      .limit(1);
    if (row?.status !== "active") {
      throw new HTTPException(403, { message: "Account suspended" });
    }
  }

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
