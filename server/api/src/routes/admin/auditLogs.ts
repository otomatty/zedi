/**
 * `GET /api/admin/audit-logs` — 管理操作の監査ログ一覧 API。
 * Admin audit log list API.
 *
 * 参照専用のエンドポイント（追記・削除・更新なし）。
 * Read-only endpoint; audit records cannot be mutated through the API.
 */
import { Hono } from "hono";
import { and, desc, eq, gte, lte, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { adminAuditLogs } from "../../schema/auditLogs.js";
import { users } from "../../schema/users.js";
import type { AppEnv } from "../../types/index.js";

const app = new Hono<AppEnv>();

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

/**
 * クエリから limit を取り出し 1〜MAX_LIMIT に丸める。
 * Clamp `limit` query param to [1, MAX_LIMIT].
 */
function clampLimit(raw: string | undefined): number {
  const n = parseInt(raw ?? String(DEFAULT_LIMIT), 10);
  if (!Number.isFinite(n)) return DEFAULT_LIMIT;
  return Math.min(Math.max(1, n), MAX_LIMIT);
}

/**
 * クエリから offset を取り出し 0 以上に丸める。
 * Clamp `offset` query param to a non-negative integer.
 */
function clampOffset(raw: string | undefined): number {
  const n = parseInt(raw ?? "0", 10);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, n);
}

/**
 * ISO 8601 風の日付文字列をパースし、不正値の場合は null を返す。
 * Parse an ISO-ish date string, returning null on invalid input.
 */
function parseDate(raw: string | undefined): { date: Date | null; invalid: boolean } {
  if (raw === undefined) return { date: null, invalid: false };
  const trimmed = raw.trim();
  if (!trimmed) return { date: null, invalid: false };
  const d = new Date(trimmed);
  if (Number.isNaN(d.getTime())) return { date: null, invalid: true };
  return { date: d, invalid: false };
}

/**
 * GET /api/admin/audit-logs
 *
 * クエリパラメータ:
 * - `actorUserId`: 操作者ユーザー ID で絞り込む
 * - `action`: 操作種別で絞り込む（例: `user.role.update`）
 * - `targetType`: 対象種別で絞り込む（例: `user`）
 * - `targetId`: 対象 ID で絞り込む
 * - `from`, `to`: ISO 8601 日時で期間絞り込み（createdAt）
 * - `limit`, `offset`: ページング（limit は最大 200）
 *
 * Query parameters:
 * - `actorUserId`: filter by actor user ID
 * - `action`: filter by action (e.g. `user.role.update`)
 * - `targetType`: filter by target type (e.g. `user`)
 * - `targetId`: filter by target ID
 * - `from`, `to`: ISO 8601 datetime range on `createdAt`
 * - `limit`, `offset`: pagination (`limit` max 200)
 */
app.get("/", async (c) => {
  const db = c.get("db");

  const actorUserId = c.req.query("actorUserId")?.trim();
  const action = c.req.query("action")?.trim();
  const targetType = c.req.query("targetType")?.trim();
  const targetId = c.req.query("targetId")?.trim();

  const from = parseDate(c.req.query("from"));
  if (from.invalid) {
    return c.json({ error: "invalid 'from' date (ISO 8601 required)" }, 400);
  }
  const to = parseDate(c.req.query("to"));
  if (to.invalid) {
    return c.json({ error: "invalid 'to' date (ISO 8601 required)" }, 400);
  }
  if (from.date && to.date && from.date > to.date) {
    return c.json({ error: "'from' must be earlier than or equal to 'to'" }, 400);
  }

  const limit = clampLimit(c.req.query("limit"));
  const offset = clampOffset(c.req.query("offset"));

  const conditions: SQL[] = [];
  if (actorUserId) conditions.push(eq(adminAuditLogs.actorUserId, actorUserId));
  if (action) conditions.push(eq(adminAuditLogs.action, action));
  if (targetType) conditions.push(eq(adminAuditLogs.targetType, targetType));
  if (targetId) conditions.push(eq(adminAuditLogs.targetId, targetId));
  if (from.date) conditions.push(gte(adminAuditLogs.createdAt, from.date));
  if (to.date) conditions.push(lte(adminAuditLogs.createdAt, to.date));

  const whereClause = conditions.length > 0 ? and(...conditions) : sql`true`;

  // actor と target (target_type='user' のときのみ) を LEFT JOIN で引き当てる。
  // Alias `user` twice so we can look up actor / target email in one query.
  const actor = alias(users, "actor");
  const target = alias(users, "target");

  const rows = await db
    .select({
      id: adminAuditLogs.id,
      actorUserId: adminAuditLogs.actorUserId,
      actorEmail: actor.email,
      actorName: actor.name,
      action: adminAuditLogs.action,
      targetType: adminAuditLogs.targetType,
      targetId: adminAuditLogs.targetId,
      targetEmail: target.email,
      targetName: target.name,
      before: adminAuditLogs.before,
      after: adminAuditLogs.after,
      ipAddress: adminAuditLogs.ipAddress,
      userAgent: adminAuditLogs.userAgent,
      createdAt: adminAuditLogs.createdAt,
    })
    .from(adminAuditLogs)
    .leftJoin(actor, eq(actor.id, adminAuditLogs.actorUserId))
    .leftJoin(
      target,
      and(eq(adminAuditLogs.targetType, "user"), eq(target.id, adminAuditLogs.targetId)),
    )
    .where(whereClause)
    .orderBy(desc(adminAuditLogs.createdAt), desc(adminAuditLogs.id))
    .limit(limit)
    .offset(offset);

  const [countRow] = await db
    .select({ count: sql<number>`cast(count(*) as integer)` })
    .from(adminAuditLogs)
    .where(whereClause);

  const total = countRow?.count ?? 0;

  return c.json({
    logs: rows.map((r) => ({
      id: r.id,
      actorUserId: r.actorUserId,
      actorEmail: r.actorEmail,
      actorName: r.actorName,
      action: r.action,
      targetType: r.targetType,
      targetId: r.targetId,
      targetEmail: r.targetEmail,
      targetName: r.targetName,
      before: r.before,
      after: r.after,
      ipAddress: r.ipAddress,
      userAgent: r.userAgent,
      createdAt: r.createdAt,
    })),
    total,
  });
});

export default app;
