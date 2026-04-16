import { adminFetch } from "./client";

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
 * Lint の 1 件の検出結果。
 * A single lint finding.
 */
export interface LintFindingItem {
  id: string;
  rule: LintRule;
  severity: LintSeverity;
  page_ids: string[];
  detail: Record<string, unknown>;
  created_at: string;
  resolved_at?: string | null;
}

/**
 * Lint 実行結果のサマリ（ルールごとの件数）。
 * Lint run summary (count per rule).
 */
export interface LintRunSummaryItem {
  rule: LintRule;
  count: number;
}

async function getErrorMessage(res: Response, fallback: string): Promise<string> {
  const err = await res.json().catch(() => ({ message: res.statusText }));
  return (err as { message?: string }).message ?? fallback;
}

/**
 * Lint を実行する。
 * Triggers a lint run.
 *
 * @returns ルールごとのサマリと合計件数 / Summary per rule and total count
 */
export async function runLint(): Promise<{ summary: LintRunSummaryItem[]; total: number }> {
  const res = await adminFetch("/api/lint/run", { method: "POST" });
  if (!res.ok) {
    throw new Error(await getErrorMessage(res, "Failed to run lint"));
  }
  return res.json();
}

/**
 * 未解決の Lint findings を取得する。
 * Fetches unresolved lint findings.
 *
 * @returns findings と合計件数 / Findings and total count
 */
export async function getLintFindings(): Promise<{
  findings: LintFindingItem[];
  total: number;
}> {
  const res = await adminFetch("/api/lint/findings");
  if (!res.ok) {
    throw new Error(await getErrorMessage(res, "Failed to fetch lint findings"));
  }
  return res.json();
}

/**
 * Lint finding を解決済みにマークする。
 * Marks a lint finding as resolved.
 *
 * @param id - Finding ID
 * @returns 更新された finding / Updated finding
 */
export async function resolveLintFinding(id: string): Promise<{ finding: LintFindingItem }> {
  const res = await adminFetch(`/api/lint/findings/${encodeURIComponent(id)}/resolve`, {
    method: "POST",
  });
  if (!res.ok) {
    throw new Error(await getErrorMessage(res, "Failed to resolve finding"));
  }
  return res.json();
}
