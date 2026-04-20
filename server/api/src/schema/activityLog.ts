/**
 * Activity log for the LLM Wiki pattern (P4, otomatty/zedi#598).
 *
 * Append-only record of Wiki-level actions: ingest, chat→wiki promotion,
 * lint runs, wiki generation, and index rebuilds. Separate from
 * `ai_usage_logs` (which tracks token spend) and `admin_audit_logs` (admin-only
 * compliance trail); this table is per-user and describes *what happened to
 * the wiki* so users can see how their knowledge base evolved.
 *
 * LLM Wiki パターンの活動ログ。
 * Ingest / Chat → Wiki 昇格 / Lint 実行 / Wiki 生成 / Index 再構築などを
 * 追記専用で記録する。課金用の `ai_usage_logs`・管理者監査用の
 * `admin_audit_logs` とは別物で、Wiki の成長履歴をユーザーに見せることを
 * 目的とする。
 *
 * @see https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f
 */
import { pgTable, uuid, text, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { users } from "./users.js";

/**
 * Kind of activity recorded in the log.
 * 活動ログに記録する種別。
 *
 * - `clip_ingest`: Web クリップ → Wiki への ingest 実行 / Web clip ingested into wiki
 * - `chat_promote`: AI Chat 会話の Wiki ページ昇格 / AI chat promoted to wiki page
 * - `lint_run`: Lint エンジンのバッチ実行 / Lint engine run
 * - `wiki_generate`: AI による Wiki ページ生成 / AI-driven wiki page generation
 * - `index_build`: `__index__` 特殊ページの再構築 / Rebuild of the `__index__` page
 * - `wiki_schema_update`: Wiki スキーマ編集 / Wiki schema edit
 */
export type ActivityKind =
  | "clip_ingest"
  | "chat_promote"
  | "lint_run"
  | "wiki_generate"
  | "index_build"
  | "wiki_schema_update";

/**
 * Actor of an activity: who initiated it.
 * 操作の起点。"user"=ユーザー手動 / "ai"=AI 経由 / "system"=バッチ・内部呼び出し。
 */
export type ActivityActor = "user" | "ai" | "system";

/**
 * Wiki activity log table.
 * Wiki の行動ログテーブル。
 *
 * @property id - レコードの一意 ID / Row ID
 * @property ownerId - 対象ユーザー ID / Owner user ID
 * @property kind - 活動種別 / Activity kind
 * @property actor - 起点の種別 / Initiator category
 * @property targetPageIds - 対象ページ ID 配列（0 件以上）/ Related page IDs (zero or more)
 * @property detail - ルール固有の詳細 JSON / Rule-specific detail payload
 * @property createdAt - 記録時刻 / Recorded at
 */
export const activityLog = pgTable(
  "activity_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind").notNull().$type<ActivityKind>(),
    actor: text("actor").notNull().$type<ActivityActor>(),
    targetPageIds: text("target_page_ids").array().notNull().default([]),
    detail: jsonb("detail").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    // Most queries list the latest entries for an owner, optionally filtered by kind.
    // 大半のクエリはオーナーごとに新しい順で取得し、kind で絞り込む。
    index("idx_activity_log_owner_created").on(table.ownerId, table.createdAt.desc()),
    index("idx_activity_log_owner_kind_created").on(
      table.ownerId,
      table.kind,
      table.createdAt.desc(),
    ),
  ],
);

/** Select type for `activity_log`. / `activity_log` の SELECT 型。 */
export type ActivityLog = typeof activityLog.$inferSelect;
/** Insert type for `activity_log`. / `activity_log` の INSERT 型。 */
export type NewActivityLog = typeof activityLog.$inferInsert;
