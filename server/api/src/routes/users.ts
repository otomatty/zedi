import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { eq } from "drizzle-orm";
import { users } from "../schema/index.js";
import { authRequired } from "../middleware/auth.js";
import type { AppEnv } from "../types/index.js";

const app = new Hono<AppEnv>();

app.get("/me", authRequired, async (c) => {
  const userId = c.get("userId");
  const db = c.get("db");

  // Project only the fields clients need. `select()` would also leak internal
  // moderation columns (status / suspendedAt / suspendedReason / suspendedBy)
  // to the account owner; those are server-only.
  const result = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      emailVerified: users.emailVerified,
      image: users.image,
      role: users.role,
      createdAt: users.createdAt,
      updatedAt: users.updatedAt,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!result.length) {
    throw new HTTPException(404, { message: "User not found" });
  }

  return c.json({ user: result[0] });
});

/**
 * 自分自身のプロフィール（限定フィールド）を取得する。
 * 他ユーザーの ID を指定した場合は 403 を返す（列挙リスク防止）。
 *
 * Returns own profile (limited fields). Returns 403 for other users'
 * IDs to prevent user enumeration. See: #430
 */
app.get("/:id", authRequired, async (c) => {
  const id = c.req.param("id");
  const userId = c.get("userId");
  const db = c.get("db");

  if (id !== userId) {
    throw new HTTPException(403, { message: "Forbidden" });
  }

  const result = await db
    .select({
      id: users.id,
      name: users.name,
      image: users.image,
    })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);
  if (!result.length) {
    throw new HTTPException(404, { message: "User not found" });
  }

  return c.json({ user: result[0] });
});

export default app;
