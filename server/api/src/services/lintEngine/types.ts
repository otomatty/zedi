import type { LintRule, LintSeverity } from "../../schema/lintFindings.js";

/**
 * 1 件の Lint 検出結果（DB 挿入前）。
 * A single lint finding before DB insertion.
 */
export interface LintFindingCandidate {
  rule: LintRule;
  severity: LintSeverity;
  pageIds: string[];
  detail: Record<string, unknown>;
}

/**
 * Lint ルールの実行結果。
 * Result returned by each lint rule runner.
 */
export interface LintRuleResult {
  rule: LintRule;
  findings: LintFindingCandidate[];
}

/**
 * ルール実行関数のシグネチャ。
 * Signature of a lint rule runner function.
 *
 * @param ownerId - 対象ユーザー ID / Target user ID
 * @param db - データベース接続 / Database connection
 * @returns Lint 検出結果 / Lint findings
 */
export type LintRuleRunner = (
  ownerId: string,
  db: import("../../types/index.js").Database,
) => Promise<LintRuleResult>;
