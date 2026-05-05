#!/usr/bin/env node
/**
 * Claude による API エラー解析エントリポイント。Epic #616 Phase 2 / Issue #806。
 *
 * GitHub Actions の `repository_dispatch` (`event_type: analyze-error`) で
 * 起動され、以下を実行する:
 *
 *   1. `client_payload`（`api_error_id`, `sentry_issue_id`, `title`, `route`）
 *      を環境変数から受け取る。
 *   2. `title` / `route` から推定キーワードを生成し、リポジトリ内を grep して
 *      関連しそうなファイル抜粋を集める（プロンプトのコンテキスト化）。
 *   3. Anthropic SDK で Claude を呼び、`prompt.md` のテンプレートを埋めた
 *      指示で構造化 JSON を返させる（最大 2 回までリトライ）。
 *   4. Zod スキーマ (`schema.mjs`) で出力を検証し、JSON ファイルへ書き出す。
 *
 * Entry point for the Claude AI error-analysis step (Epic #616 Phase 2 /
 * issue #806). Invoked from `action.yml` and ultimately from the
 * `analyze-error.yml` workflow on `repository_dispatch`. Reads the dispatch
 * `client_payload` via env, gathers light repo context, asks Claude for a
 * structured JSON analysis, validates it with Zod, and writes the result to
 * an output file. The HTTP `PUT` back to the API is performed by a later
 * workflow step using the GitHub App installation token — this script never
 * touches the network for the API callback to keep responsibilities split.
 *
 * 失敗時は非 0 で終了する（API には書き戻さない）。Epic #616 の方針通り、
 * 失敗してもユーザーリクエストには影響しない（fire-and-forget）。
 *
 * Exits non-zero on failure so the workflow step turns red without writing a
 * partial result. Per Epic #616, an analyze failure must not affect end-user
 * requests; the Sentry webhook fires this dispatch with `.catch(log)` upstream.
 */
import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import Anthropic from "@anthropic-ai/sdk";
import { parseAndValidate } from "./schema.mjs";

// `import.meta.dirname` は Node 20.11+ で利用可能。`new URL(import.meta.url).pathname`
// 経由よりも Windows 互換が良い（`/C:/...` 問題を踏まない）。
// `import.meta.dirname` (Node 20.11+) is preferred over deriving the path from
// `import.meta.url` because it does not produce broken `/C:/...` paths on
// Windows. CI runs on Linux but the script is also exercised locally.
const HERE = import.meta.dirname;

/**
 * Claude モデル ID。最新の Sonnet 4.6 を既定にする。`CLAUDE_MODEL` 環境変数で
 * 上書き可能（コスト調整 / モデル切替用）。
 *
 * Default Claude model. Sonnet 4.6 balances cost and analysis quality for the
 * per-error workload. Override via `CLAUDE_MODEL` env when tuning.
 */
const DEFAULT_MODEL = "claude-sonnet-4-6";

/**
 * Anthropic API リトライ回数。issue #806 の「workflow 内で 1〜2 回まで」要件に
 * 合わせて最大 2 試行（初回 + 1 回リトライ）。
 *
 * Maximum Anthropic API attempts. Issue #806 specifies "1〜2 回まで" — so we
 * allow one retry on top of the initial call (2 attempts total).
 */
const MAX_ATTEMPTS = 2;

/**
 * リトライ間の待機時間（ms）。固定 5 秒（指数バックオフは不要 — 試行回数が少ない）。
 * Backoff between attempts. Fixed 5 s — exponential backoff is overkill for the
 * 2-attempt cap.
 */
const RETRY_DELAY_MS = 5_000;

/**
 * grep でリポジトリから抜粋する候補ファイルの最大数。プロンプトが肥大化して
 * Claude のコンテキスト上限・コスト・レイテンシに跳ねないように上限を入れる。
 *
 * Cap on grep-matched files included in the prompt. Prevents the prompt from
 * ballooning past Claude's context window and keeps per-call cost predictable.
 */
const MAX_EXCERPT_FILES = 6;

/**
 * 1 ファイルあたりの抜粋上限（行数）。先頭からこの行数だけ含める。
 * Per-file excerpt cap (lines). We grab the head of each candidate file rather
 * than full content to keep prompts bounded.
 */
const MAX_LINES_PER_FILE = 80;

/**
 * 出力 JSON が空欄しか含まなくても、`severity` と `ai_summary` が成立すれば
 * `parseAndValidate` は通る（Zod 側がそうなっているので）。
 * フォールバック severity（Anthropic 呼び出し失敗時に書き戻したい場合用）。
 *
 * Fallback severity used by the workflow if it ever needs to record an
 * "analysis failed" placeholder. Currently unused — exported for callers that
 * want to compose a degraded record without re-deriving the enum.
 */
export const FALLBACK_SEVERITY = "unknown";

/**
 * 必須環境変数を読み出して dispatch payload に整形する。欠けていたら throw。
 * Read required env vars and assemble them into a normalized payload. Throws
 * with a precise message identifying the missing variable so workflow logs
 * point at the misconfiguration immediately.
 *
 * @returns {{
 *   apiErrorId: string,
 *   sentryIssueId: string,
 *   title: string,
 *   route: string,
 *   repository: string,
 *   anthropicApiKey: string,
 *   model: string,
 *   outputPath: string,
 *   workspace: string,
 *   dryRun: boolean
 * }}
 */
function readEnv() {
  const must = (name) => {
    const v = process.env[name]?.trim();
    if (!v) throw new Error(`required env var ${name} is missing`);
    return v;
  };
  // dryRun を先に決める。Anthropic 呼び出しを行わないドライラン経路では
  // `ANTHROPIC_API_KEY` が未設定でも動作するようにし、secrets が未配備の fork や
  // 検証用環境でも `workflow_dispatch` でパイプラインを通せるようにする。
  //
  // Resolve `dryRun` first so the dry-run path tolerates a missing
  // `ANTHROPIC_API_KEY`. Fork PRs and pre-secrets-rollout environments rely
  // on this to exercise the analyze step end-to-end without the API key.
  const dryRun = /^(1|true|yes)$/i.test(process.env.CLAUDE_ANALYZE_DRY_RUN?.trim() ?? "");
  return {
    apiErrorId: must("CLAUDE_ANALYZE_API_ERROR_ID"),
    sentryIssueId: must("CLAUDE_ANALYZE_SENTRY_ISSUE_ID"),
    title: must("CLAUDE_ANALYZE_TITLE"),
    // route は API 側でも null を許容しているので空文字を許す。
    // route is nullable on the server side, so we permit empty string here.
    route: process.env.CLAUDE_ANALYZE_ROUTE?.trim() ?? "",
    repository: must("CLAUDE_ANALYZE_REPOSITORY"),
    anthropicApiKey: dryRun
      ? (process.env.ANTHROPIC_API_KEY?.trim() ?? "")
      : must("ANTHROPIC_API_KEY"),
    model: process.env.CLAUDE_MODEL?.trim() || DEFAULT_MODEL,
    outputPath: must("CLAUDE_ANALYZE_OUTPUT"),
    workspace: process.env.GITHUB_WORKSPACE?.trim() || process.cwd(),
    dryRun,
  };
}

/**
 * `title` / `route` から検索キーワードを抽出する。短すぎる語 (< 4 文字)、
 * よくある語 (`error`, `failed` など)、HTTP メソッドは除外。重複も除く。
 * Sentry のタイトルに日本語などの非 ASCII 文字が含まれても切り捨てないよう、
 * Unicode プロパティ（`\p{L}` 文字 / `\p{N}` 数字）で語境界を判定する。
 *
 * Extract searchable tokens from `title` / `route`. Filters short words
 * (< 4 chars), common error vocabulary, and HTTP verbs so grep lands on
 * symbols/paths actually present in the codebase rather than every file
 * containing the word "error". Splits on Unicode property classes so that
 * non-ASCII titles (Japanese error messages, identifiers with accented
 * characters, …) keep their tokens instead of getting stripped to empty.
 *
 * @param {string} title
 * @param {string} route
 * @returns {string[]}
 */
export function deriveKeywords(title, route) {
  const stop = new Set([
    "error",
    "failed",
    "failure",
    "exception",
    "warning",
    "post",
    "get",
    "put",
    "delete",
    "patch",
    "head",
    "null",
    "undefined",
    "true",
    "false",
    "from",
    "with",
    "this",
    "that",
    "into",
  ]);
  const tokens = `${title} ${route}`
    .split(/[^\p{L}\p{N}_/.\-]+/u)
    .map((t) => t.trim())
    .filter((t) => t.length >= 4 && !stop.has(t.toLowerCase()));
  return Array.from(new Set(tokens)).slice(0, 8);
}

/**
 * `git grep` をワークスペース内で実行し、ヒットしたファイル名のユニーク集合を返す。
 * `git` が利用できない / リポジトリでない場合は空配列。`-l` でファイル名のみ取得し、
 * `-n` の行番号は使わない（後段で先頭抜粋に切り替えるため）。
 *
 * Run `git grep -l` for each keyword and union the matching file paths. Returns
 * an empty array if `git` is unavailable or the workspace is not a repo. Uses
 * `-l` (filename-only) instead of `-n` because we'll grab the file head as
 * excerpt rather than the precise hit line — keeps the prompt deterministic.
 *
 * @param {string[]} keywords
 * @param {string} workspace
 * @returns {string[]}
 */
export function grepCandidateFiles(keywords, workspace) {
  if (keywords.length === 0) return [];
  // 全キーワードをまとめて 1 回の `git grep -e KW1 -e KW2 ...` で検索する。
  // 個別呼び出しに比べてプロセス起動コストを N→1 に削減できる（OR 検索なので
  // ファイル名集合の和は変わらない）。
  //
  // Run a single `git grep` with `-e` for each keyword instead of spawning N
  // processes. `git grep` with multiple `-e` flags performs an OR search, so
  // the resulting filename set is identical to the previous loop's union but
  // avoids per-keyword process startup overhead.
  const patternFlags = keywords.flatMap((kw) => ["-e", kw]);
  const res = spawnSync(
    "git",
    [
      "grep",
      "-l",
      ...patternFlags,
      "--",
      // 巨大な lockfile / 生成物 / バイナリは検索対象外。
      // Skip lockfiles, build outputs, and binaries.
      ":!*.lock",
      ":!*lock.json",
      ":!dist/**",
      ":!**/dist/**",
      ":!node_modules/**",
      ":!**/node_modules/**",
      ":!**/*.png",
      ":!**/*.jpg",
      ":!**/*.svg",
      ":!**/*.pdf",
    ],
    { cwd: workspace, encoding: "utf8", timeout: 15_000 },
  );
  /** @type {Set<string>} */
  const hits = new Set();
  if (res.status === 0 && typeof res.stdout === "string") {
    for (const line of res.stdout.split("\n")) {
      const trimmed = line.trim();
      if (trimmed) hits.add(trimmed);
    }
  }
  // 候補が多すぎるとプロンプトが肥大化するので、source パスらしいものを優先する。
  // Rank: prefer real source files; deprioritize tests, docs, snapshots.
  const ranked = Array.from(hits).sort((a, b) => rankPath(a) - rankPath(b));
  return ranked.slice(0, MAX_EXCERPT_FILES);
}

/**
 * ソースっぽいパスほど低いスコアを返してソート上位に来るようにする。
 * Lower score = higher priority. Tests / docs / snapshots are deprioritized so
 * the AI sees implementation files first when the prompt budget is tight.
 *
 * @param {string} p
 * @returns {number}
 */
function rankPath(p) {
  if (/(?:^|\/)__tests__\//.test(p)) return 5;
  if (/\.test\.|\.spec\./.test(p)) return 5;
  if (/\.snap$/.test(p)) return 9;
  if (/(?:^|\/)docs?\//i.test(p)) return 4;
  if (/\.md$/i.test(p)) return 3;
  if (/^server\/api\/src\//.test(p)) return 0;
  if (/^src\//.test(p)) return 1;
  return 2;
}

/**
 * 候補ファイルを先頭 N 行だけ読み込んでプロンプト用テキストブロックにまとめる。
 * 読めないファイルは黙ってスキップする（生成物・バイナリ等）。
 *
 * Read the first N lines of each candidate file and assemble them into a
 * prompt-ready text block. Silently skips files that fail to read so a single
 * unreadable artefact never aborts the whole analysis.
 *
 * @param {string[]} files
 * @param {string} workspace
 * @returns {Promise<string>}
 */
export async function buildExcerpts(files, workspace) {
  if (files.length === 0) return "(no candidate files matched the keyword search)";
  const blocks = [];
  for (const rel of files) {
    const abs = path.join(workspace, rel);
    if (!existsSync(abs)) continue;
    try {
      const content = await readFile(abs, "utf8");
      const head = content.split("\n").slice(0, MAX_LINES_PER_FILE).join("\n");
      blocks.push(`### ${rel}\n\n\`\`\`\n${head}\n\`\`\`\n`);
    } catch {
      // unreadable / binary — skip silently
    }
  }
  return blocks.length > 0 ? blocks.join("\n") : "(candidate files matched but were unreadable)";
}

/**
 * `prompt.md` を読み込んで `{{key}}` プレースホルダを置換する。
 * Load `prompt.md` and substitute `{{key}}` placeholders. Unknown placeholders
 * are left intact so a typo surfaces visibly in the rendered prompt rather
 * than silently emitting an empty string.
 *
 * @param {Record<string, string>} vars
 * @returns {Promise<string>}
 */
export async function renderPrompt(vars) {
  const tmpl = await readFile(path.join(HERE, "prompt.md"), "utf8");
  return tmpl.replace(/\{\{(\w+)\}\}/g, (_, key) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? String(vars[key]) : `{{${key}}}`,
  );
}

/**
 * Anthropic API を呼び、Claude が返したテキストを返す。失敗時はリトライする。
 * Call the Anthropic API with retry. Surfaces the final error after
 * `MAX_ATTEMPTS` so workflow logs reflect the actual upstream failure rather
 * than a generic "no response" message.
 *
 * @param {Anthropic} client
 * @param {string} model
 * @param {string} prompt
 * @returns {Promise<string>}
 */
async function callClaudeWithRetry(client, model, prompt) {
  /** @type {unknown} */
  let lastErr = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const response = await client.messages.create({
        model,
        // 解析結果の JSON は数 KB を超えないので 2048 で十分。Claude の出力上限は
        // 別途モデル側で決まるが、ここは「上限ヒットして截ち切られない」目的の値。
        // The analysis JSON tops out at a few KB; 2048 is comfortably above the
        // expected ceiling and prevents truncation.
        max_tokens: 2048,
        messages: [{ role: "user", content: prompt }],
      });
      // text ブロックを連結して返す（tool use は使っていない）。
      // Concatenate text blocks; we don't use tool_use here.
      const text = response.content
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();
      if (!text) {
        throw new Error("Claude returned an empty response");
      }
      return text;
    } catch (err) {
      lastErr = err;
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[claude-analyze] attempt ${attempt}/${MAX_ATTEMPTS} failed: ${msg}`);
      if (attempt < MAX_ATTEMPTS) {
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
      }
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("Claude call failed");
}

/**
 * メイン処理。env を読み、context を集め、Claude に問い、結果を JSON ファイルに書く。
 * Orchestration entry point: read env, gather context, ask Claude, validate,
 * write file. Any throw bubbles up to the top-level handler at the bottom of
 * this module which logs and exits 1.
 *
 * @returns {Promise<void>}
 */
export async function main() {
  const env = readEnv();
  // 起動時ログでは title / route の生値を出さない。Sentry の data scrubbing が
  // 一次防御だが、CI ログは別保管面なので二段防御として長さだけを残す。
  // api_error_id / sentry_issue_id はそれぞれ DB の id / Sentry 内の id で機密性が
  // 低いのでそのまま出して相関を取れるようにする。
  //
  // Avoid logging raw `title` / `route` at startup. Sentry's data scrubbing is
  // the primary defense, but CI logs are a separate retention plane, so we
  // emit metadata only here as a second line of defense. `api_error_id` and
  // `sentry_issue_id` are bare ids (no PII) and stay verbatim so log lines
  // can be cross-referenced with the admin UI / Sentry.
  console.log(
    `[claude-analyze] api_error_id=${env.apiErrorId} sentry_issue_id=${env.sentryIssueId} title_len=${env.title.length} route_present=${env.route.length > 0}`,
  );

  const keywords = deriveKeywords(env.title, env.route);
  // keywords も title/route 由来なので個別の文字列は出さず件数だけ残す。
  // Keywords are derived from title/route, so log only the count (not the
  // tokens themselves) to keep CI logs free of substring leaks.
  console.log(`[claude-analyze] keywords_count=${keywords.length}`);
  const candidateFiles = grepCandidateFiles(keywords, env.workspace);
  console.log(`[claude-analyze] candidate_files=${JSON.stringify(candidateFiles)}`);
  const excerpts = await buildExcerpts(candidateFiles, env.workspace);

  const prompt = await renderPrompt({
    repository: env.repository,
    api_error_id: env.apiErrorId,
    sentry_issue_id: env.sentryIssueId,
    title: env.title,
    route: env.route || "(unknown)",
    repo_excerpts: excerpts,
  });

  /** @type {string} */
  let raw;
  if (env.dryRun) {
    // ドライラン: API 呼び出しを行わず、固定 stub を返してパイプラインだけ通す。
    // Dry-run: skip the API call and return a fixed stub so the pipeline can
    // be exercised end-to-end (workflow_dispatch + fixture inputs) without
    // burning Anthropic credits.
    console.log("[claude-analyze] DRY RUN — skipping Anthropic call");
    raw = JSON.stringify({
      severity: "unknown",
      ai_summary: `(dry-run) would analyze ${env.title}`,
      ai_root_cause: null,
      ai_suggested_fix: null,
      // schema 上限 (max 5) と `prompt.md` の出力規約に合わせて先頭 5 件に絞る。
      // grep 上限 (`MAX_EXCERPT_FILES` = 6) より小さいため明示的に slice する。
      // Cap at the schema's 5-entry limit (the same cap documented in
      // `prompt.md`). `MAX_EXCERPT_FILES` is 6 so an explicit slice is needed.
      ai_suspected_files: candidateFiles
        .slice(0, 5)
        .map((p) => ({ path: p, reason: "grep candidate" })),
    });
  } else {
    const client = new Anthropic({ apiKey: env.anthropicApiKey });
    raw = await callClaudeWithRetry(client, env.model, prompt);
  }

  const validated = parseAndValidate(raw);
  console.log(`[claude-analyze] severity=${validated.severity}`);

  const outputJson = JSON.stringify(validated, null, 2);
  await writeFile(env.outputPath, `${outputJson}\n`, "utf8");
  console.log(`[claude-analyze] wrote analysis to ${env.outputPath}`);
}

// `import` for tests should not auto-run main(). Only run when invoked
// directly as a script (matches Node's pattern for ESM entry detection).
const invokedDirectly =
  process.argv[1] && path.resolve(process.argv[1]) === new URL(import.meta.url).pathname;
if (invokedDirectly) {
  main().catch((err) => {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[claude-analyze] FATAL: ${msg}`);
    process.exit(1);
  });
}
