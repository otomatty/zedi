/**
 * `api_errors` テーブル — Sentry が検知した API エラーの集約サマリ。
 * 生のスタックトレース・パラメータは Sentry 側に保持し、本テーブルでは
 * 重複排除済みの「issue 単位の状態」を保持する。Epic #616 / Sub-issue #802 に準拠。
 *
 * `api_errors` table — aggregated summary of API errors detected by Sentry.
 * Raw stack traces and request payloads stay in Sentry; this table only stores
 * the deduplicated "per-issue state" (occurrence count, severity, status,
 * AI analysis output, GitHub issue mapping). See Epic #616 / sub-issue #802.
 *
 * @see https://github.com/otomatty/zedi/issues/616
 * @see https://github.com/otomatty/zedi/issues/802
 */
import { pgTable, uuid, text, integer, timestamp, jsonb, index } from "drizzle-orm/pg-core";

/**
 * AI が判定する重大度。Issue 自動起票は `high` / `medium` のみが対象になる
 * （`low` は集約のみ、`unknown` は AI 解析未完了の暫定値）。
 *
 * AI-assigned severity. Issue auto-creation only triggers for `high` / `medium`.
 * `low` is aggregated but never escalated; `unknown` is the default before AI
 * analysis finishes.
 */
export type ApiErrorSeverity = "high" | "medium" | "low" | "unknown";

/**
 * 管理者が更新するエラーのワークフロー状態。
 * Workflow status updated by an admin via the management UI.
 *
 * - `open`: 新規検出・未対応 / Newly detected, untriaged
 * - `investigating`: 調査中 / Currently being investigated
 * - `resolved`: 解決済み（再発時は `open` に戻す） / Fixed; reopened on regression
 * - `ignored`: 既知だが対応不要と判断 / Known and intentionally ignored
 */
export type ApiErrorStatus = "open" | "investigating" | "resolved" | "ignored";

/**
 * AI が推定した「関連しそうなファイル」のエントリ。
 * Suspected file entry produced by the AI analysis step.
 */
export interface ApiErrorSuspectedFile {
  /** リポジトリ相対パス / Repository-relative path */
  path: string;
  /** 関連と推定する根拠（任意） / Optional rationale */
  reason?: string;
  /** 行番号（任意） / Optional line number */
  line?: number;
}

/**
 * `api_errors` テーブル定義。`sentry_issue_id` をユニークキーにして upsert する。
 *
 * Drizzle definition for the `api_errors` table. `sentry_issue_id` is the
 * idempotency key used by `apiErrorService.upsertFromSentrySummary` so the
 * same Sentry issue cannot create duplicate rows when alerts fire repeatedly.
 */
export const apiErrors = pgTable(
  "api_errors",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Sentry の issue ID（`group.id`）。upsert キー / Sentry issue id; upsert key */
    sentryIssueId: text("sentry_issue_id").notNull().unique(),
    /** Sentry の fingerprint または自前計算したグルーピングキー / Grouping fingerprint */
    fingerprint: text("fingerprint"),
    /** エラー要約タイトル / Short error title */
    title: text("title").notNull(),
    /** 発生したルート（例: `POST /api/ingest`） / Route where the error fired */
    route: text("route"),
    /** HTTP ステータスコード / HTTP status code */
    statusCode: integer("status_code"),
    /** 集約済み発生回数（alert ごとに加算）/ Total occurrences across alerts */
    occurrences: integer("occurrences").notNull().default(1),
    /** 初回観測時刻（upsert で更新しない）/ First-seen timestamp; preserved on upsert */
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).defaultNow().notNull(),
    /** 最終観測時刻（upsert で前進する） / Last-seen timestamp; advances on upsert */
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).defaultNow().notNull(),
    /** AI 解析後の重大度（既定 `unknown`） / Severity after AI analysis */
    severity: text("severity").$type<ApiErrorSeverity>().notNull().default("unknown"),
    /** 管理画面で人が更新するワークフロー状態 / Admin-updated workflow status */
    status: text("status").$type<ApiErrorStatus>().notNull().default("open"),
    /** AI が生成した要約 / AI-generated summary */
    aiSummary: text("ai_summary"),
    /** AI が推定した関連ファイル一覧 / AI-suspected related files */
    aiSuspectedFiles: jsonb("ai_suspected_files").$type<ApiErrorSuspectedFile[]>(),
    /** AI が推定した原因仮説 / AI-suspected root cause */
    aiRootCause: text("ai_root_cause"),
    /** AI が推奨する修正方針 / AI-suggested fix direction */
    aiSuggestedFix: text("ai_suggested_fix"),
    /** 自動起票した GitHub Issue 番号（low / 起票前は null） / Linked GitHub issue number */
    githubIssueNumber: integer("github_issue_number"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    // Admin UI の主クエリは「未対応を新着順で見る」なのでこれを先頭インデックスに置く。
    // The admin UI's primary query lists open issues newest-first, so this
    // composite index covers the hot path.
    index("idx_api_errors_status_last_seen").on(table.status, table.lastSeenAt.desc()),
    // severity フィルタ + status の絞り込み（severity:high & status:open 等）。
    // For severity-filtered admin queries (e.g. severity=high & status=open).
    index("idx_api_errors_severity_status").on(table.severity, table.status),
    // last_seen_at だけでの新着順表示用 / For straight newest-first listings.
    index("idx_api_errors_last_seen").on(table.lastSeenAt.desc()),
  ],
);

/** SELECT 行型 / Row type for `api_errors` SELECT results. */
export type ApiError = typeof apiErrors.$inferSelect;

/** INSERT 値型 / Insert payload type for `api_errors`. */
export type NewApiError = typeof apiErrors.$inferInsert;
