import { Hono } from "hono";
import { eq, like, desc, sql, and, ne } from "drizzle-orm";
import { authRequired } from "../../middleware/auth.js";
import { adminRequired } from "../../middleware/adminAuth.js";
import { users, session } from "../../schema/users.js";
import { recordAuditLog } from "../../lib/auditLog.js";
import { getUserImpact, anonymizeUser } from "../../lib/userDelete.js";
import auditLogsRoutes from "./auditLogs.js";
import type { AppEnv } from "../../types/index.js";
import type { UserStatus } from "../../schema/users.js";

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

/**
 * GET /api/admin/users — list users (paginated, optional email search, optional status filter).
 *
 * ユーザー一覧を取得する（ページネーション、メール検索、ステータスフィルタ対応）。
 */
app.get("/users", async (c) => {
  const db = c.get("db");
  const search = c.req.query("search")?.trim();
  const statusFilter = c.req.query("status")?.trim() as UserStatus | undefined;
  const limitRaw = parseInt(c.req.query("limit") ?? String(DEFAULT_LIMIT), 10);
  const limit = Number.isFinite(limitRaw)
    ? Math.min(Math.max(1, limitRaw), MAX_LIMIT)
    : DEFAULT_LIMIT;
  const offsetRaw = parseInt(c.req.query("offset") ?? "0", 10);
  const offset = Number.isFinite(offsetRaw) ? Math.max(0, offsetRaw) : 0;

  const conditions = [];
  if (search) {
    conditions.push(like(users.email, `%${search.replace(/[%_\\]/g, (ch) => `\\${ch}`)}%`));
  }
  if (statusFilter && ["active", "suspended", "deleted"].includes(statusFilter)) {
    conditions.push(eq(users.status, statusFilter));
  } else if (!statusFilter) {
    // デフォルトでは削除済みユーザーを除外する
    // Exclude deleted users by default when no status filter is specified
    conditions.push(ne(users.status, "deleted"));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : sql`true`;

  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      status: users.status,
      suspendedAt: users.suspendedAt,
      suspendedReason: users.suspendedReason,
      suspendedBy: users.suspendedBy,
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
      status: u.status,
      suspendedAt: u.suspendedAt,
      suspendedReason: u.suspendedReason,
      suspendedBy: u.suspendedBy,
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
        status: users.status,
        suspendedAt: users.suspendedAt,
        suspendedReason: users.suspendedReason,
        suspendedBy: users.suspendedBy,
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

/**
 * POST /api/admin/users/:id/suspend — suspend a user (admin only).
 *
 * ユーザーをサスペンドする。対象ユーザーの全セッションを削除し強制ログアウトさせる。
 * 自分自身をサスペンドすることはできない。
 *
 * Suspends a user, deletes all their sessions (forced logout), and records
 * an audit log. Self-suspension is not allowed.
 */
app.post("/users/:id/suspend", async (c) => {
  const id = c.req.param("id");
  const db = c.get("db");
  const currentUserId = c.get("userId");

  // 自己サスペンド防止 / Prevent self-suspension
  if (id === currentUserId) {
    return c.json({ error: "Cannot suspend yourself" }, 400);
  }

  let body: { reason?: string };
  try {
    body = await c.req.json<{ reason?: string }>();
  } catch {
    body = {};
  }

  const reason = typeof body.reason === "string" ? body.reason.trim() || null : null;

  const result = await db.transaction(async (tx) => {
    const [target] = await tx
      .select({
        id: users.id,
        status: users.status,
        role: users.role,
      })
      .from(users)
      .where(eq(users.id, id))
      .limit(1);

    if (!target) {
      return { notFound: true } as const;
    }

    if (target.status === "suspended") {
      return { alreadySuspended: true } as const;
    }

    const now = new Date();

    const [updated] = await tx
      .update(users)
      .set({
        status: "suspended",
        suspendedAt: now,
        suspendedReason: reason,
        suspendedBy: currentUserId,
        updatedAt: now,
      })
      .where(eq(users.id, id))
      .returning({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
        status: users.status,
        suspendedAt: users.suspendedAt,
        suspendedReason: users.suspendedReason,
        suspendedBy: users.suspendedBy,
        createdAt: users.createdAt,
      });

    if (!updated) {
      return { notFound: true } as const;
    }

    // 対象ユーザーの全セッションを削除して強制ログアウト
    // Delete all sessions for the target user to force logout
    await tx.delete(session).where(eq(session.userId, id));

    // 監査ログに記録 / Record audit log
    await recordAuditLog(c, tx, {
      action: "user.suspend",
      targetType: "user",
      targetId: id,
      before: { status: target.status },
      after: { status: "suspended", reason },
    });

    return { updated } as const;
  });

  if ("notFound" in result) {
    return c.json({ error: "User not found" }, 404);
  }

  if ("alreadySuspended" in result) {
    return c.json({ error: "User is already suspended" }, 400);
  }

  return c.json({ user: result.updated });
});

/**
 * POST /api/admin/users/:id/unsuspend — unsuspend (reactivate) a user (admin only).
 *
 * サスペンドされたユーザーを復活させる。
 *
 * Reactivates a suspended user. Clears suspension metadata and records
 * an audit log.
 */
app.post("/users/:id/unsuspend", async (c) => {
  const id = c.req.param("id");
  const db = c.get("db");

  const result = await db.transaction(async (tx) => {
    const [target] = await tx
      .select({
        id: users.id,
        status: users.status,
        suspendedReason: users.suspendedReason,
      })
      .from(users)
      .where(eq(users.id, id))
      .limit(1);

    if (!target) {
      return { notFound: true } as const;
    }

    if (target.status !== "suspended") {
      return { notSuspended: true } as const;
    }

    const [updated] = await tx
      .update(users)
      .set({
        status: "active",
        suspendedAt: null,
        suspendedReason: null,
        suspendedBy: null,
        updatedAt: new Date(),
      })
      .where(eq(users.id, id))
      .returning({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
        status: users.status,
        suspendedAt: users.suspendedAt,
        suspendedReason: users.suspendedReason,
        suspendedBy: users.suspendedBy,
        createdAt: users.createdAt,
      });

    if (!updated) {
      return { notFound: true } as const;
    }

    // 監査ログに記録 / Record audit log
    await recordAuditLog(c, tx, {
      action: "user.unsuspend",
      targetType: "user",
      targetId: id,
      before: { status: "suspended", reason: target.suspendedReason },
      after: { status: "active" },
    });

    return { updated } as const;
  });

  if ("notFound" in result) {
    return c.json({ error: "User not found" }, 404);
  }

  if ("notSuspended" in result) {
    return c.json({ error: "User is not suspended" }, 400);
  }

  return c.json({ user: result.updated });
});

/**
 * GET /api/admin/users/:id/impact — 削除前の影響範囲を取得する。
 *
 * Returns the impact of deleting a user: owned notes count, active sessions,
 * subscription status, and last AI usage timestamp.
 */
app.get("/users/:id/impact", async (c) => {
  const id = c.req.param("id");
  const db = c.get("db");

  // ユーザーの存在確認 / Verify user exists
  const [target] = await db.select({ id: users.id }).from(users).where(eq(users.id, id)).limit(1);

  if (!target) {
    return c.json({ error: "User not found" }, 404);
  }

  const impact = await getUserImpact(db, id);
  return c.json(impact);
});

/**
 * DELETE /api/admin/users/:id — ユーザーを論理削除する（admin only）。
 *
 * トランザクション内で以下を実行する:
 * 1. 対象ユーザーの全セッション削除
 * 2. OAuth 連携情報（account テーブル）を削除
 * 3. 個人情報を匿名化し status='deleted' に設定
 * 4. 監査ログに user.delete を記録
 *
 * Soft-deletes a user within a single transaction:
 * 1. Deletes all sessions (forced logout)
 * 2. Deletes OAuth account records
 * 3. Anonymizes personal data and sets status='deleted'
 * 4. Records audit log with action 'user.delete'
 */
app.delete("/users/:id", async (c) => {
  const id = c.req.param("id");
  const db = c.get("db");
  const currentUserId = c.get("userId");

  // 自己削除防止 / Prevent self-deletion
  if (id === currentUserId) {
    return c.json({ error: "Cannot delete yourself" }, 400);
  }

  const result = await db.transaction(async (tx) => {
    // 対象ユーザーの存在・ステータス確認 / Check target user exists and status
    const [target] = await tx
      .select({ id: users.id, status: users.status })
      .from(users)
      .where(eq(users.id, id))
      .limit(1);

    if (!target) {
      return { notFound: true } as const;
    }

    if (target.status === "deleted") {
      return { alreadyDeleted: true } as const;
    }

    // 匿名化・セッション削除・アカウント削除を実行
    // Anonymize user, delete sessions and account records
    const { updated, before } = await anonymizeUser(tx, id);

    // 監査ログに記録（匿名化前のスナップショットを before に保存）
    // Record audit log with before-snapshot (pre-anonymization)
    await recordAuditLog(c, tx, {
      action: "user.delete",
      targetType: "user",
      targetId: id,
      before,
      after: { status: "deleted" },
    });

    return { updated } as const;
  });

  if ("notFound" in result) {
    return c.json({ error: "User not found" }, 404);
  }

  if ("alreadyDeleted" in result) {
    return c.json({ error: "User is already deleted" }, 400);
  }

  return c.json({ user: result.updated });
});

export default app;
