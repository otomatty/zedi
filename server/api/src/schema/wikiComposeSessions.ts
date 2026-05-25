/**
 * `wiki_compose_sessions` — メタデータテーブル。1 行 = 1 つの compose 実行。
 *
 * Meta-row table for Wiki Compose runs. Each row represents a single user-
 * initiated compose session for a page; LangGraph's internal `checkpoints*`
 * tables (owned by `PostgresSaver.setup()`) hold the per-step graph state and
 * stay outside Drizzle's migration set on purpose.
 *
 * The session id is reused as the LangGraph `thread_id`, so callers can
 * stream / resume by passing the same UUID to both subsystems.
 *
 * Issue: #948 (P0 — LangGraph 基盤)
 */
import { pgTable, uuid, text, timestamp, index, jsonb } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./users.js";
import { pages } from "./pages.js";

/**
 * Compose セッションの状態遷移。
 *
 * - `pending`     — 行作成済み、run 未開始。Created but never started.
 * - `running`     — run 中。Streaming or in-flight.
 * - `interrupted` — interrupt で停止中。resume 可。Paused at an interrupt; resumable.
 * - `completed`   — 正常終了。Successfully finished.
 * - `failed`      — 異常終了。Failed with an error.
 * - `cancelled`   — ユーザーが DELETE で取り消した。User-cancelled.
 */
export type WikiComposeSessionStatus =
  | "pending"
  | "running"
  | "interrupted"
  | "completed"
  | "failed"
  | "cancelled";

/**
 * Compose セッションのメタテーブル。
 * Wiki Compose session metadata table.
 */
export const wikiComposeSessions = pgTable(
  "wiki_compose_sessions",
  {
    /**
     * Session UUID。LangGraph `thread_id` としても再利用する。
     * Session UUID; also used as the LangGraph `thread_id`.
     */
    id: uuid("id").primaryKey().defaultRandom(),
    /**
     * 対象ページ ID。
     * Page id this session writes against.
     */
    pageId: uuid("page_id")
      .notNull()
      .references(() => pages.id, { onDelete: "cascade" }),
    /**
     * 実行ユーザー ID。
     * Executing user id.
     */
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /**
     * 登録済みグラフの論理 ID（registry key）。
     * Registered graph logical id (registry key).
     */
    graphId: text("graph_id").notNull(),
    /**
     * 直近フェーズ。subgraph 横断の進捗を 1 カラムで表現する軽量フィールド。
     * Last-known phase identifier (mirrors LangGraph state's `phase` field).
     */
    phase: text("phase").notNull().default("init"),
    /**
     * 実行 backend。`zedi_managed` または `user_*`（#951 BYOK）。セッション作成時に固定。
     * Execution backend; `zedi_managed` or `user_*` BYOK backends (#951), fixed at create.
     */
    backend: text("backend").notNull().default("zedi_managed"),
    /**
     * セッション状態。`WikiComposeSessionStatus` を文字列で保持する。
     * Status of the session as text (see {@link WikiComposeSessionStatus}).
     */
    status: text("status").$type<WikiComposeSessionStatus>().notNull().default("pending"),
    /**
     * クライアント由来のメタ情報（モデル ID、初期入力サマリ等）。
     * Free-form metadata supplied by the client at creation time.
     */
    metadata: jsonb("metadata"),
    /**
     * 失敗時のエラーメッセージ。失敗状態以外では null。
     * Last error message; only populated when `status = 'failed'`.
     */
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    /**
     * 完了時刻。`completed` / `failed` / `cancelled` 遷移時にセット。
     * Closed-out timestamp; set when leaving an in-flight state.
     */
    closedAt: timestamp("closed_at", { withTimezone: true }),
  },
  (table) => [
    /**
     * `GET /api/pages/:pageId/compose-sessions/:id` の参照経路用インデックス。
     * Lookup index for fetching a session belonging to a specific page.
     */
    index("idx_wiki_compose_sessions_page_id").on(table.pageId),
    /**
     * ユーザー単位の一覧用インデックス（管理画面・利用状況集計）。
     * Per-user listing index for admin / usage dashboards.
     */
    index("idx_wiki_compose_sessions_user_id").on(table.userId),
    /**
     * "ページごとに新しい順" 列挙用部分複合インデックス。
     * Partial composite index for "list sessions for a page newest-first".
     * Restricting to non-terminal statuses keeps the index small for the
     * common UI query of "what's currently active for this page?".
     */
    index("idx_wiki_compose_sessions_page_active_updated")
      .on(table.pageId, table.updatedAt.desc())
      .where(sql`${table.status} IN ('pending', 'running', 'interrupted')`),
  ],
);

/** Select type. */
export type WikiComposeSession = typeof wikiComposeSessions.$inferSelect;
/** Insert type. */
export type NewWikiComposeSession = typeof wikiComposeSessions.$inferInsert;
