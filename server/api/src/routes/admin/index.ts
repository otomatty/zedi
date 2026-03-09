import { Hono } from "hono";
import { eq, like, desc, sql } from "drizzle-orm";
import { authRequired } from "../../middleware/auth.js";
import { adminRequired } from "../../middleware/adminAuth.js";
import { users } from "../../schema/users.js";
import type { AppEnv } from "../../types/index.js";

const app = new Hono<AppEnv>();

app.use("*", authRequired);
app.use("*", adminRequired);

/** GET /api/admin/me — current admin user (for admin UI). */
app.get("/me", (c) => {
  const userId = c.get("userId");
  const userEmail = c.get("userEmail");
  return c.json({
    id: userId,
    email: userEmail ?? null,
    role: "admin" as const,
  });
});

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

/** GET /api/admin/users — list users (paginated, optional email search). */
app.get("/users", async (c) => {
  const db = c.get("db");
  const search = c.req.query("search")?.trim();
  const limitRaw = parseInt(c.req.query("limit") ?? String(DEFAULT_LIMIT), 10);
  const limit = Number.isFinite(limitRaw)
    ? Math.min(Math.max(1, limitRaw), MAX_LIMIT)
    : DEFAULT_LIMIT;
  const offsetRaw = parseInt(c.req.query("offset") ?? "0", 10);
  const offset = Number.isFinite(offsetRaw) ? Math.max(0, offsetRaw) : 0;

  const conditions = search
    ? like(users.email, `%${search.replace(/[%_\\]/g, (ch) => `\\${ch}`)}%`)
    : undefined;

  const whereClause = conditions ?? sql`true`;

  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(whereClause)
    .orderBy(desc(users.createdAt))
    .limit(limit)
    .offset(offset);

  const [countRow] = await db
    .select({ count: sql<number>`cast(count(*) as integer)` })
    .from(users)
    .where(whereClause);

  const total = countRow?.count ?? 0;

  return c.json({
    users: rows.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      createdAt: u.createdAt,
    })),
    total,
  });
});

/** PATCH /api/admin/users/:id — update user role (admin only). */
app.patch("/users/:id", async (c) => {
  const id = c.req.param("id");
  const db = c.get("db");
  let body: { role?: string };
  try {
    body = await c.req.json<{ role?: string }>();
  } catch {
    return c.json({ error: "invalid JSON body" }, 400);
  }

  if (body.role !== undefined) {
    if (body.role !== "user" && body.role !== "admin") {
      return c.json({ error: "role must be 'user' or 'admin'" }, 400);
    }
  } else {
    return c.json({ error: "role is required" }, 400);
  }

  const currentUserId = c.get("userId");
  if (id === currentUserId && body.role === "user") {
    return c.json(
      { error: "Cannot change your own role to user (self-demotion not allowed)" },
      400,
    );
  }

  const [updated] = await db
    .update(users)
    .set({
      role: body.role as "user" | "admin",
      updatedAt: new Date(),
    })
    .where(eq(users.id, id))
    .returning({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      createdAt: users.createdAt,
    });

  if (!updated) {
    return c.json({ error: "User not found" }, 404);
  }

  return c.json({ user: updated });
});

export default app;
