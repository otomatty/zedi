import { pgTable, uuid, text, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { users } from "./users.js";

/**
 * Lint ルール名の型。
 * Lint rule name type.
 */
export type LintRule = "orphan" | "ghost_many" | "title_similar" | "conflict" | "broken_link";

/**
 * Lint 重要度の型。
 * Lint severity type.
 */
export type LintSeverity = "info" | "warn" | "error";

/**
 * Wiki Lint 検出結果テーブル。
 * バッチまたはオンデマンドで実行した Lint の結果を永続化する。
 *
 * Wiki Lint findings table.
 * Persists results from batch or on-demand Lint runs.
 */
export const lintFindings = pgTable(
  "lint_findings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    rule: text("rule").notNull().$type<LintRule>(),
    severity: text("severity").notNull().$type<LintSeverity>(),
    pageIds: text("page_ids").array().notNull(),
    detail: jsonb("detail").$type<Record<string, unknown>>(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_lint_findings_owner_id").on(table.ownerId),
    index("idx_lint_findings_rule").on(table.rule),
    index("idx_lint_findings_owner_rule").on(table.ownerId, table.rule),
  ],
);

/**
 *
 */
export type LintFinding = typeof lintFindings.$inferSelect;
/**
 *
 */
export type NewLintFinding = typeof lintFindings.$inferInsert;
