import { pgTable, text, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { users } from "./users.js";

/**
 * 管理操作の監査ログ。追記専用（GET のみ公開）で、コンプライアンス・
 * インシデント調査用途を想定する。
 *
 * Admin audit log. Append-only (API exposes GET only) for compliance and
 * incident forensics.
 *
 * - `actor_user_id`: 操作を行った管理者ユーザー ID / Admin user who performed the action
 * - `action`: 操作種別文字列（例: `user.role.update`） / Action identifier
 * - `target_type`: 対象種別（例: `user`） / Target entity type
 * - `target_id`: 対象 ID（一覧系の操作では null 可） / Target entity id (nullable)
 * - `before` / `after`: 変更前後のスナップショット（jsonb） / Pre/post snapshots
 * - `ip_address` / `user_agent`: リクエスト元情報 / Request origin info
 */
export const adminAuditLogs = pgTable(
  "admin_audit_logs",
  {
    id: text("id").primaryKey(),
    actorUserId: text("actor_user_id")
      .notNull()
      .references(() => users.id),
    action: text("action").notNull(),
    targetType: text("target_type").notNull(),
    targetId: text("target_id"),
    before: jsonb("before").$type<Record<string, unknown> | null>(),
    after: jsonb("after").$type<Record<string, unknown> | null>(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_admin_audit_logs_created_id").on(table.createdAt, table.id),
    index("idx_admin_audit_logs_actor_created").on(table.actorUserId, table.createdAt),
    index("idx_admin_audit_logs_target_created").on(
      table.targetType,
      table.targetId,
      table.createdAt,
    ),
    index("idx_admin_audit_logs_action_created").on(table.action, table.createdAt),
  ],
);

/** Row type for `admin_audit_logs` SELECT results. */
export type AdminAuditLog = typeof adminAuditLogs.$inferSelect;

/** Row type for `admin_audit_logs` INSERT values. */
export type NewAdminAuditLog = typeof adminAuditLogs.$inferInsert;
