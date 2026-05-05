#!/usr/bin/env node
/**
 * `autoIssue.mjs` を GitHub Actions のステップから呼び出すための薄いラッパ。
 * Epic #616 Phase 3 / Issue #808。
 *
 * 期待する環境変数 / Required env (set by `action.yml`):
 *   - `AUTO_ISSUE_OUTPUT_PATH`     : `analyze.mjs` が書き出した解析結果 JSON のパス
 *   - `AUTO_ISSUE_SENTRY_ISSUE_ID` : Sentry の issue id
 *   - `AUTO_ISSUE_API_ERROR_ID`    : `api_errors.id` (UUID)
 *   - `AUTO_ISSUE_TITLE`           : Sentry 由来の短いエラータイトル
 *   - `AUTO_ISSUE_ROUTE`           : ルート（空でも可）
 *   - `AUTO_ISSUE_REPOSITORY`      : `${{ github.repository }}` 形式
 *   - `AUTO_ISSUE_TOKEN`           : GitHub App installation token (issues: write)
 *   - `AUTO_ISSUE_WORKFLOW_RUN_URL`: 当該 workflow run の URL
 *
 * Thin wrapper that loads the analysis JSON, then calls `runAutoIssue`. Exits
 * non-zero on failure so the workflow step turns red. Intentionally minimal —
 * all of the testable logic lives in `autoIssue.mjs`.
 */
import { readFile } from "node:fs/promises";
import process from "node:process";

import { runAutoIssue } from "./autoIssue.mjs";

/**
 * Required env var を読み出す。欠落は `Error` で即時失敗させる。
 *
 * Read a required env var; throw if missing so misconfiguration surfaces at
 * the start of the step rather than midway through HTTP calls.
 *
 * @param {string} name
 * @returns {string}
 */
function requireEnv(name) {
  const value = process.env[name];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

async function main() {
  const outputPath = requireEnv("AUTO_ISSUE_OUTPUT_PATH");
  const sentryIssueId = requireEnv("AUTO_ISSUE_SENTRY_ISSUE_ID");
  const apiErrorId = requireEnv("AUTO_ISSUE_API_ERROR_ID");
  const title = requireEnv("AUTO_ISSUE_TITLE");
  const repository = requireEnv("AUTO_ISSUE_REPOSITORY");
  const token = requireEnv("AUTO_ISSUE_TOKEN");
  const workflowRunUrl = requireEnv("AUTO_ISSUE_WORKFLOW_RUN_URL");
  // route は空文字を許容。
  const route = process.env.AUTO_ISSUE_ROUTE ?? "";

  const raw = await readFile(outputPath, "utf8");
  /** @type {unknown} */
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to parse analysis JSON at ${outputPath}: ${msg}`);
  }

  // analyze.mjs が `parseAndValidate` 経由で出力しているので、ここでは型ナローイング
  // のみ行う（再検証はしない — 二重バリデーションは責務分離を曖昧にするため）。
  // The analyze step already runs `parseAndValidate`; we only narrow the type
  // here. Re-validating would muddy the responsibility split (schema lives
  // with the analyze script).
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Analysis JSON did not parse to an object");
  }
  const analysis = /** @type {{ severity: string, ai_summary: string }} */ (parsed);

  const result = await runAutoIssue({
    analysis,
    sentryIssueId,
    apiErrorId,
    title,
    route,
    repository,
    token,
    workflowRunUrl,
  });

  // GITHUB_OUTPUT に結果を書き出して、後続ステップから参照できるようにする。
  // Emit an `outcome` annotation + GITHUB_OUTPUT so reviewers can spot the
  // outcome in the workflow run summary at a glance.
  const summary = JSON.stringify(result);
  console.log(`[auto-issue] result=${summary}`);
  console.log(`::notice title=Auto-issue outcome::${summary}`);

  const githubOutput = process.env.GITHUB_OUTPUT;
  if (githubOutput) {
    const { appendFile } = await import("node:fs/promises");
    const lines = [`action=${result.action}`];
    if (result.action !== "skipped") {
      lines.push(`issue_number=${result.issueNumber}`);
      lines.push(`issue_html_url=${result.html_url}`);
    }
    await appendFile(githubOutput, `${lines.join("\n")}\n`);
  }
}

main().catch((err) => {
  const msg = err instanceof Error ? err.stack || err.message : String(err);
  console.error(`[auto-issue] failed: ${msg}`);
  process.exit(1);
});
