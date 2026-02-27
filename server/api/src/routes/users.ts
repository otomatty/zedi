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

  const result = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!result.length) {
    throw new HTTPException(404, { message: "User not found" });
  }

  return c.json({ user: result[0] });
});

app.get("/:id", authRequired, async (c) => {
  const id = c.req.param("id");
  const db = c.get("db");

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
