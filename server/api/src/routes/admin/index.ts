import { Hono } from "hono";
import { eq, like, desc, sql } from "drizzle-orm";
import { authRequired } from "../../middleware/auth.js";
import { adminRequired } from "../../middleware/adminAuth.js";
import { users } from "../../schema/users.js";
import { recordAuditLog } from "../../lib/auditLog.js";
import auditLogsRoutes from "./auditLogs.js";
import type { AppEnv } from "../../types/index.js";

const app = new Hono<AppEnv>();

app.use("*", authRequired);
app.use("*", adminRequired);

// 監査ログのサブルート / Audit log sub-routes
app.route("/audit-logs", auditLogsRoutes);

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

/**
 * PATCH /api/admin/users/:id — update user role (admin only).
 *
 * ロール変更時は `admin_audit_logs` に `user.role.update` を記録する。
 * 監査ログの書き込みは本体 UPDATE と同一トランザクションで行われ、
 * どちらかが失敗した場合は全体がロールバックされる。
 *
 * On role change, an `admin_audit_logs` row is written with action
 * `user.role.update` inside the same transaction as the UPDATE, so the
 * entire operation is atomic.
 */
app.patch("/users/:id", async (c) => {
  const id = c.req.param("id");
  const db = c.get("db");
  let body: { role?: string };
  try {
    body = await c.req.json<{ role?: string }>();
  } catch {
    return c.json({ error: "invalid JSON body" }, 400);
  }

  if (body.role === undefined) {
    return c.json({ error: "role is required" }, 400);
  }
  if (body.role !== "user" && body.role !== "admin") {
    return c.json({ error: "role must be 'user' or 'admin'" }, 400);
  }

  const newRole = body.role;
  const currentUserId = c.get("userId");
  if (id === currentUserId && newRole === "user") {
    return c.json(
      { error: "Cannot change your own role to user (self-demotion not allowed)" },
      400,
    );
  }

  const result = await db.transaction(async (tx) => {
    const [before] = await tx
      .select({ id: users.id, role: users.role })
      .from(users)
      .where(eq(users.id, id))
      .limit(1);

    if (!before) {
      return { notFound: true } as const;
    }

    const [updated] = await tx
      .update(users)
      .set({
        role: newRole,
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

    // 通常ここには到達しない（select で存在を確認済み）。
    // Should be unreachable: row existence was just verified above.
    if (!updated) {
      return { notFound: true } as const;
    }

    if (before.role !== newRole) {
      await recordAuditLog(c, tx, {
        action: "user.role.update",
        targetType: "user",
        targetId: updated.id,
        before: { role: before.role },
        after: { role: newRole },
      });
    }

    return { updated } as const;
  });

  if ("notFound" in result) {
    return c.json({ error: "User not found" }, 404);
  }

  return c.json({ user: result.updated });
});

export default app;
