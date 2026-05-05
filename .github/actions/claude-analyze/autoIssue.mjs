/**
 * Auto-issue helpers and orchestrator for the analyze-error workflow.
 * Epic #616 Phase 3 / Issue #808.
 *
 * `analyze.mjs` の出力 JSON を受け取り、AI が判定した `severity` が `high` /
 * `medium` のときに限り、GitHub Issue を新規起票するか、既存の重複 Issue に
 * コメントを追記する。`sentry-issue:<sentry_issue_id>` ラベルを「同一 Sentry
 * issue に対するオープン Issue は 1 件」の判定キーとして使う。
 *
 * Reads the validated analysis JSON emitted by `analyze.mjs`. When AI-assigned
 * `severity` is `high` or `medium`, files a fresh GitHub Issue or appends a
 * recurrence comment if an open Issue already exists for the same Sentry issue
 * id. The `sentry-issue:<id>` label is the dedup key — there must be at most
 * one open Issue per Sentry id (Epic #616 acceptance criterion: "same error
 * 100 times → 1 Issue").
 *
 * 設計上の分離 / Design split:
 *   - 純粋関数（`shouldFileIssue`, `buildIssueTitle`, `buildIssueBody`,
 *     `buildRecurrenceCommentBody`, `buildSentryIssueLabel`,
 *     `parseRepository`）は副作用ゼロでユニットテスト可能。
 *   - HTTP 層は `runAutoIssue` 経由のみ。`fetch` を引数で差し替え可能にして
 *     テストでは GitHub API を叩かない。
 *
 *   - Pure helpers are side-effect-free and unit-tested in
 *     `__tests__/autoIssue.test.mjs`.
 *   - The HTTP layer goes through `runAutoIssue` only; tests inject a `fetch`
 *     stub so no real GitHub API call is ever made by the test runner.
 *
 * @see ./schema.mjs
 * @see ./analyze.mjs
 * @see https://github.com/otomatty/zedi/issues/808
 * @see https://github.com/otomatty/zedi/issues/616
 */

/**
 * GitHub REST API ベース URL。GitHub Enterprise では差し替えが必要だが、
 * 本リポジトリは github.com 固定なので定数で良い。
 *
 * GitHub REST API base URL. Hard-coded to github.com; if Zedi ever migrates
 * to GHES this needs to read from the `GITHUB_API_URL` env exposed by Actions.
 */
const GITHUB_API = "https://api.github.com";

/**
 * Issue 起票の対象になる severity 値。`low` / `unknown` はスキップ
 * （Epic #616：「low は集約のみ」）。
 *
 * Severity values that warrant filing an Issue. `low` and `unknown` are
 * intentionally skipped per Epic #616 ("low はノイズ抑制のため起票しない").
 */
const ISSUE_SEVERITIES = new Set(["high", "medium"]);

/**
 * 新規 Issue に必ず付与する静的ラベル。`sentry-issue:<id>` は別途追加する。
 * 順序は決定論的にしておくとスナップショット系テストが安定する。
 *
 * Static labels applied to every auto-filed Issue. The dynamic
 * `sentry-issue:<id>` label is added separately. Ordering is deterministic so
 * snapshot-style assertions stay stable.
 */
export const STATIC_LABELS = Object.freeze(["monitoring", "auto-reported"]);

/**
 * 自動付与するラベルのメタデータ。リポジトリに未登録の場合に
 * `POST /repos/{o}/{r}/labels` で生成する際に使う。
 *
 * Metadata for labels we auto-create when missing. Used by `ensureLabel` when
 * `GET /labels/{name}` returns 404. Colors are intentionally muted so they do
 * not visually drown out human-curated labels.
 */
const LABEL_METADATA = {
  monitoring: {
    color: "5319e7",
    description: "Production monitoring & on-call surface (Epic #616).",
  },
  "auto-reported": {
    color: "ededed",
    description: "Auto-filed by the analyze-error workflow (Epic #616 Phase 3).",
  },
  // sentry-issue:<id> 系は description にラベルの趣旨だけ書く。色は黄系。
  // sentry-issue:<id> labels share a yellow-ish color and a single description.
  __sentryIssue: {
    color: "fbca04",
    description: "1:1 dedup key for a Sentry issue id (sentry-issue:<id>).",
  },
};

/**
 * Issue タイトルに含めるエラー本文の最大長。GitHub の Issue タイトルは 256 文字
 * までだが、severity prefix と sentry suffix を足した上で 256 を割らないよう、
 * 本文部分は控えめに 180 で打ち切る。
 *
 * Cap on the embedded error-title portion of the Issue title. GitHub allows up
 * to 256 chars; reserving headroom for the `[severity]` prefix and
 * `(sentry:<id>)` suffix keeps the result safely under the limit even with
 * long Sentry ids.
 */
const TITLE_BODY_MAX = 180;

/**
 * AI 判定 severity が Issue 起票対象（high / medium）か判定する純粋関数。
 *
 * Pure predicate: returns `true` when the AI-assigned severity warrants
 * creating or commenting on a GitHub Issue.
 *
 * @param {unknown} severity - The `severity` field from the analysis JSON.
 * @returns {boolean}
 */
export function shouldFileIssue(severity) {
  return typeof severity === "string" && ISSUE_SEVERITIES.has(severity);
}

/**
 * `sentry-issue:<id>` ラベル名を生成する。空文字 / 非文字列は早期に弾いて
 * 呼び出し側のバグ（payload 欠落など）を可視化する。
 *
 * Build the `sentry-issue:<id>` label string. Throws on empty / non-string
 * input so a missing payload field surfaces as a CI failure rather than as a
 * silently-malformed label.
 *
 * @param {unknown} sentryIssueId
 * @returns {string}
 */
export function buildSentryIssueLabel(sentryIssueId) {
  if (typeof sentryIssueId !== "string" || sentryIssueId.length === 0) {
    throw new Error("sentryIssueId must be a non-empty string");
  }
  return `sentry-issue:${sentryIssueId}`;
}

/**
 * `owner/repo` 形式の文字列を分解する。`github.repository` env からの値を
 * 想定。スラッシュが 1 つでないものは弾く。
 *
 * Parse an `owner/repo` slug (typically `process.env.GITHUB_REPOSITORY`).
 * Throws unless the input has exactly one `/`.
 *
 * @param {unknown} repository
 * @returns {{ owner: string, repo: string }}
 */
export function parseRepository(repository) {
  if (typeof repository !== "string") {
    throw new Error("repository must be a string in 'owner/repo' form");
  }
  const parts = repository.split("/");
  if (parts.length !== 2 || parts[0].length === 0 || parts[1].length === 0) {
    throw new Error(`repository must be in 'owner/repo' form, got: ${repository}`);
  }
  return { owner: parts[0], repo: parts[1] };
}

/**
 * Issue タイトルを生成する。`[severity] <error title> (sentry:<id>)` 形式。
 * 本文タイトルは `TITLE_BODY_MAX` で打ち切る（GitHub の 256 文字上限対策）。
 *
 * Build the GitHub Issue title in `[severity] <title> (sentry:<id>)` form.
 * The error-title segment is truncated to `TITLE_BODY_MAX` to leave room for
 * the prefix / suffix under GitHub's 256-character cap. Empty titles fall
 * back to `(no title)` so the issue list stays readable.
 *
 * @param {{ severity: string, title: string, sentryIssueId: string }} input
 * @returns {string}
 */
export function buildIssueTitle({ severity, title, sentryIssueId }) {
  const trimmed = (title ?? "").trim();
  let body;
  if (trimmed.length === 0) {
    body = "(no title)";
  } else if (trimmed.length <= TITLE_BODY_MAX) {
    body = trimmed;
  } else {
    // 切り捨ての可視化のため末尾 3 文字を `...` に置き換える。文字数は
    // `TITLE_BODY_MAX` 内に収める（合計サイズは GitHub の 256 文字上限を侵さない）。
    // Replace the last 3 chars with `...` so readers see at a glance that the
    // title was truncated. Keeps total length ≤ TITLE_BODY_MAX so the
    // prefix/suffix stay safely under GitHub's 256-char Issue-title cap.
    body = `${trimmed.slice(0, TITLE_BODY_MAX - 3)}...`;
  }
  return `[${severity}] ${body} (sentry:${sentryIssueId})`;
}

/**
 * 抜粋 Markdown 用にユーザー由来の任意文字列をエスケープして 1 行表示する。
 * 空文字列・null / undefined は `(none)` を返す。改行は半角スペースに畳み、
 * 表組みのセル区切り `|` はバックスラッシュでエスケープする（route や AI 出力に
 * `|` が混入したときに表が崩れないようにする）。
 *
 * Inline-safe formatter for free-form strings dropped into the Issue body
 * tables. Returns `(none)` for empty / null / undefined input. Collapses
 * newlines to a single space and escapes `|` as `\|` so a stray pipe in a
 * route segment or AI-generated string cannot break the surrounding Markdown
 * table.
 *
 * @param {unknown} value
 * @returns {string}
 */
function inlineOrNone(value) {
  if (value === null || value === undefined) return "(none)";
  if (typeof value !== "string") return "(none)";
  // バックスラッシュを先にエスケープしてから pipe をエスケープする。順序を
  // 逆にすると入力 `\|` が `\\|` になり、Markdown 上は「リテラル `\` + 生 `|`」
  // と解釈されて表が壊れる（CodeQL: Incomplete string escaping）。
  // Escape backslashes first, then pipes. Reversing the order would turn an
  // input of `\|` into `\\|`, which Markdown renders as a literal `\` plus a
  // raw `|` — and the raw pipe would break the surrounding table cell.
  const escaped = value.replace(/\\/g, "\\\\").replace(/\|/g, "\\|");
  const collapsed = escaped.replace(/\s+/g, " ").trim();
  return collapsed.length === 0 ? "(none)" : collapsed;
}

/**
 * 複数行文字列をブロック表示用に整形する。空 / null は `(none)` を返す。
 * Markdown のコードフェンスではなく blockquote にして、AI 出力の Markdown
 * 構文（リスト等）が壊れないようにする。
 *
 * Block-style formatter for multi-line strings. Returns `(none)` for empty
 * input. Uses blockquotes (`>`) rather than fenced code so the AI's Markdown
 * (lists, links) renders inline.
 *
 * @param {unknown} value
 * @returns {string}
 */
function blockOrNone(value) {
  if (typeof value !== "string" || value.trim().length === 0) return "(none)";
  return value
    .trim()
    .split(/\r?\n/)
    .map((line) => `> ${line}`)
    .join("\n");
}

/**
 * `ai_suspected_files` を bullet list に整形する。空 / null は `(none)` を返す。
 *
 * Render `ai_suspected_files` as a bullet list. Returns `(none)` for empty /
 * null. Each entry is `path` (with optional `line` and `reason`).
 *
 * @param {ReadonlyArray<{ path: string, reason?: string, line?: number }> | null | undefined} files
 * @returns {string}
 */
function renderSuspectedFiles(files) {
  if (!Array.isArray(files) || files.length === 0) return "(none)";
  return files
    .map((f) => {
      const lineSuffix = typeof f.line === "number" ? `:${f.line}` : "";
      const reasonSuffix = f.reason ? ` — ${inlineOrNone(f.reason)}` : "";
      return `- \`${f.path}${lineSuffix}\`${reasonSuffix}`;
    })
    .join("\n");
}

/**
 * Issue 本文を組み立てる。PII を含めない方針:
 *   - Sentry URL を埋め込まない（org/project slug 漏洩防止）。`sentry_issue_id`
 *     と `sentry-issue:<id>` ラベルだけで相関可能。
 *   - `route` は構造情報なので埋め込んでも PII にならないが、欠落時は `(none)`。
 *   - AI 由来文字列（summary 等）は Sentry の data scrubbing 後の入力で生成
 *     されているため二段防御済み。
 *
 * Build the GitHub Issue body. PII guards:
 *   - No Sentry URL is embedded (would leak the org / project slug).
 *     Cross-reference via the `sentry-issue:<id>` label and id instead.
 *   - `route` is structural metadata (e.g. `POST /api/pages`), safe to embed;
 *     missing values render as `(none)`.
 *   - AI-derived strings come from prompts that already operate on
 *     Sentry-scrubbed input, so they inherit the upstream PII filtering.
 *
 * @param {{
 *   severity: string,
 *   summary: string,
 *   rootCause?: string | null,
 *   suggestedFix?: string | null,
 *   suspectedFiles?: ReadonlyArray<{ path: string, reason?: string, line?: number }> | null,
 *   route?: string,
 *   sentryIssueId: string,
 *   apiErrorId: string,
 *   workflowRunUrl: string,
 * }} input
 * @returns {string}
 */
export function buildIssueBody(input) {
  const lines = [
    "<!-- Auto-filed by analyze-error workflow (Epic #616 Phase 3 / Issue #808) -->",
    "",
    "| Field | Value |",
    "| --- | --- |",
    `| Severity | \`${input.severity}\` |`,
    `| Route | ${inlineOrNone(input.route)} |`,
    `| sentry_issue_id | \`${input.sentryIssueId}\` |`,
    `| api_error_id | \`${input.apiErrorId}\` |`,
    `| Workflow run | ${input.workflowRunUrl} |`,
    "",
    "## AI summary",
    blockOrNone(input.summary),
    "",
    "## Suspected root cause",
    blockOrNone(input.rootCause),
    "",
    "## Suggested fix",
    blockOrNone(input.suggestedFix),
    "",
    "## Suspected files",
    renderSuspectedFiles(input.suspectedFiles),
    "",
    "---",
    "",
    "_This issue was filed automatically. Reopen with the `monitoring` triage flow / 自動起票された Issue。`monitoring` トリアージで再オープンしてください。_",
  ];
  return lines.join("\n");
}

/**
 * 再発時のコメント本文を組み立てる。サマリは AI が再判定した `ai_summary` を
 * 1 行だけ載せ、詳細は workflow run のリンクを辿らせる方針（Issue 本文を
 * 何度も肥大化させない）。
 *
 * Build the recurrence comment body. Keeps the comment short — only the new
 * `ai_summary` plus a link to the workflow run — to avoid bloating the Issue
 * thread when the same error recurs many times.
 *
 * @param {{
 *   severity: string,
 *   summary: string,
 *   apiErrorId: string,
 *   workflowRunUrl: string,
 * }} input
 * @returns {string}
 */
export function buildRecurrenceCommentBody(input) {
  return [
    `**Recurrence detected** (severity \`${input.severity}\`)`,
    "",
    blockOrNone(input.summary),
    "",
    `- api_error_id: \`${input.apiErrorId}\``,
    `- Workflow run: ${input.workflowRunUrl}`,
  ].join("\n");
}

/**
 * GitHub REST API への共通リクエスト。Bearer に GitHub App installation token
 * を載せる。失敗時は `Error` を throw する（呼び出し側で処理）。
 *
 * Thin REST helper. Bearer token is the GitHub App installation token. Throws
 * on non-2xx (except for the 404-tolerated paths handled by `ensureLabel`).
 *
 * @param {{
 *   url: string,
 *   method?: string,
 *   token: string,
 *   body?: unknown,
 *   fetchImpl: typeof fetch,
 *   acceptStatuses?: ReadonlyArray<number>,
 * }} args
 * @returns {Promise<{ status: number, data: unknown }>}
 */
async function ghRequest({ url, method = "GET", token, body, fetchImpl, acceptStatuses = [] }) {
  const init = {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      accept: "application/vnd.github+json",
      "x-github-api-version": "2022-11-28",
      "user-agent": "zedi-analyze-error/0.1",
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  };
  const res = await fetchImpl(url, init);
  if (!res.ok && !acceptStatuses.includes(res.status)) {
    let detail = "";
    try {
      detail = await res.text();
    } catch {
      detail = "(no body)";
    }
    throw new Error(`GitHub ${method} ${url} failed: ${res.status} ${detail}`);
  }
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  return { status: res.status, data };
}

/**
 * ラベルが存在することを保証する。404 の場合は作成する。既存の場合は no-op。
 * `sentry-issue:<id>` 系は `LABEL_METADATA.__sentryIssue` を使う。
 *
 * Ensure a label exists on the repo. If `GET /labels/{name}` returns 404,
 * create it via `POST /labels`. No-op when the label already exists. The
 * dynamic `sentry-issue:<id>` family uses the shared `__sentryIssue` metadata.
 *
 * @param {{
 *   owner: string,
 *   repo: string,
 *   label: string,
 *   token: string,
 *   fetchImpl: typeof fetch,
 *   logger?: Pick<Console, "log">,
 * }} args
 * @returns {Promise<"existing" | "created">}
 */
export async function ensureLabel({ owner, repo, label, token, fetchImpl, logger = console }) {
  // GET /labels/{name} は 404 が「未存在」のシグナル。tolerate しないと throw に
  // なるので acceptStatuses で許容。
  const get = await ghRequest({
    url: `${GITHUB_API}/repos/${owner}/${repo}/labels/${encodeURIComponent(label)}`,
    method: "GET",
    token,
    fetchImpl,
    acceptStatuses: [404],
  });
  if (get.status === 200) {
    return "existing";
  }
  const meta = LABEL_METADATA[label] ?? LABEL_METADATA.__sentryIssue;
  // 422 は「同名ラベルが既に存在」を意味する（GitHub API の検証エラー）。
  // GET と POST の間に別 workflow run が同じラベルを作った場合に発生し得る
  // ので、ここでは throw せず "existing" として扱う。同一 sentry_issue_id への
  // 並行起動は workflow の `concurrency` で 1 本に絞っているが、別 sentry_issue_id
  // が共通の `auto-reported` を初回作成するレースは残るためこのガードを付ける。
  //
  // 422 means "label already exists" (GitHub API validation error). Can happen
  // if another workflow run created the same label between our GET and POST.
  // The workflow's `concurrency` group serializes per `sentry_issue_id`, but
  // different ids racing to create the shared `auto-reported` label is still
  // possible — tolerate 422 so the recurrent path doesn't fail spuriously.
  const post = await ghRequest({
    url: `${GITHUB_API}/repos/${owner}/${repo}/labels`,
    method: "POST",
    token,
    body: { name: label, color: meta.color, description: meta.description },
    fetchImpl,
    acceptStatuses: [422],
  });
  if (post.status === 422) {
    logger.log?.(`[auto-issue] label already existed (race tolerated): ${label}`);
    return "existing";
  }
  logger.log?.(`[auto-issue] created missing label: ${label}`);
  return "created";
}

/**
 * `sentry-issue:<id>` ラベルが付いた **オープン** Issue を検索する。重複防止
 * のため、最古 (number 昇順最小) を 1 件選ぶ（GitHub API の sort=created+asc
 * を使うと安定）。
 *
 * Search for **open** Issues carrying a given `sentry-issue:<id>` label. To
 * stay deterministic if multiple matches exist (race during initial rollout
 * or manual edits), pick the issue with the smallest `number` — the original
 * file. The `?sort=created&direction=asc` query is just a hint; we still
 * defensively re-sort client-side.
 *
 * @param {{
 *   owner: string,
 *   repo: string,
 *   label: string,
 *   token: string,
 *   fetchImpl: typeof fetch,
 * }} args
 * @returns {Promise<{ number: number, html_url: string } | null>}
 */
export async function findOpenIssueByLabel({ owner, repo, label, token, fetchImpl }) {
  const params = new URLSearchParams({
    state: "open",
    labels: label,
    per_page: "100",
    sort: "created",
    direction: "asc",
  });
  const { data } = await ghRequest({
    url: `${GITHUB_API}/repos/${owner}/${repo}/issues?${params.toString()}`,
    method: "GET",
    token,
    fetchImpl,
  });
  if (!Array.isArray(data) || data.length === 0) return null;
  // GitHub の `/issues` 一覧には Pull Request も含まれる（`pull_request` プロパティで
  // 識別）。PR は除外して純粋な Issue だけを残す。
  // GitHub's `/issues` listing includes Pull Requests too (distinguishable by
  // the `pull_request` property). Filter them out so we never comment on a PR.
  const issues = data
    .filter((entry) => entry && typeof entry === "object" && !("pull_request" in entry))
    .map((entry) => ({
      number: Number(entry.number),
      html_url: typeof entry.html_url === "string" ? entry.html_url : "",
    }))
    .filter((e) => Number.isFinite(e.number));
  if (issues.length === 0) return null;
  issues.sort((a, b) => a.number - b.number);
  return issues[0];
}

/**
 * Issue を作成する。`labels` は事前に `ensureLabel` で存在確認済みである前提。
 *
 * Create a new Issue. Assumes all labels in `labels` already exist (call
 * `ensureLabel` first). Returns the created issue number / html_url.
 *
 * @param {{
 *   owner: string,
 *   repo: string,
 *   title: string,
 *   body: string,
 *   labels: ReadonlyArray<string>,
 *   token: string,
 *   fetchImpl: typeof fetch,
 * }} args
 * @returns {Promise<{ number: number, html_url: string }>}
 */
export async function createIssue({ owner, repo, title, body, labels, token, fetchImpl }) {
  const { data } = await ghRequest({
    url: `${GITHUB_API}/repos/${owner}/${repo}/issues`,
    method: "POST",
    token,
    body: { title, body, labels: [...labels] },
    fetchImpl,
  });
  return {
    number: Number(data?.number),
    html_url: typeof data?.html_url === "string" ? data.html_url : "",
  };
}

/**
 * 既存 Issue にコメントを追加する。
 *
 * Append a comment to an existing Issue.
 *
 * @param {{
 *   owner: string,
 *   repo: string,
 *   issueNumber: number,
 *   body: string,
 *   token: string,
 *   fetchImpl: typeof fetch,
 * }} args
 * @returns {Promise<{ id: number, html_url: string }>}
 */
export async function addIssueComment({ owner, repo, issueNumber, body, token, fetchImpl }) {
  const { data } = await ghRequest({
    url: `${GITHUB_API}/repos/${owner}/${repo}/issues/${issueNumber}/comments`,
    method: "POST",
    token,
    body: { body },
    fetchImpl,
  });
  return {
    id: Number(data?.id),
    html_url: typeof data?.html_url === "string" ? data.html_url : "",
  };
}

/**
 * @typedef {{
 *   action: "skipped",
 *   reason: "severity-not-actionable",
 * } | {
 *   action: "created",
 *   issueNumber: number,
 *   html_url: string,
 * } | {
 *   action: "commented",
 *   issueNumber: number,
 *   commentId: number,
 *   html_url: string,
 * }} AutoIssueResult
 */

/**
 * オーケストレータ。`analyze.mjs` の出力 + dispatch payload を受け取り、
 * severity ゲート → ラベル整備 → 既存検索 → 作成 or コメント の順で実行する。
 *
 * Top-level orchestrator. Given the validated analysis JSON and the dispatch
 * payload, runs:
 *   1. severity gate (skip `low` / `unknown`),
 *   2. ensure required labels exist,
 *   3. search for an open Issue with the `sentry-issue:<id>` label,
 *   4. comment on the existing Issue, or create a new one if none.
 *
 * Throws on any HTTP failure so the workflow step turns red and the operator
 * sees the error in CI logs.
 *
 * @param {{
 *   analysis: { severity: string, ai_summary: string, ai_root_cause?: string | null, ai_suggested_fix?: string | null, ai_suspected_files?: ReadonlyArray<{ path: string, reason?: string, line?: number }> | null },
 *   sentryIssueId: string,
 *   apiErrorId: string,
 *   title: string,
 *   route: string,
 *   repository: string,
 *   token: string,
 *   workflowRunUrl: string,
 *   fetchImpl?: typeof fetch,
 *   logger?: Pick<Console, "log">,
 * }} args
 * @returns {Promise<AutoIssueResult>}
 */
export async function runAutoIssue({
  analysis,
  sentryIssueId,
  apiErrorId,
  title,
  route,
  repository,
  token,
  workflowRunUrl,
  fetchImpl = globalThis.fetch,
  logger = console,
}) {
  if (!shouldFileIssue(analysis?.severity)) {
    logger.log?.(
      `[auto-issue] severity=${analysis?.severity} — skipping issue creation (Epic #616: low/unknown は集約のみ)`,
    );
    return { action: "skipped", reason: "severity-not-actionable" };
  }
  if (typeof token !== "string" || token.length === 0) {
    throw new Error("token must be a non-empty GitHub installation token");
  }
  const { owner, repo } = parseRepository(repository);
  const sentryLabel = buildSentryIssueLabel(sentryIssueId);
  const allLabels = [...STATIC_LABELS, sentryLabel];

  // 並列で 3 ラベル確認。GitHub の secondary rate limit を踏みやすいケースは
  // 「1 リクエストあたり〜100ms 以下の連続発行」なので、3 並列なら問題ない。
  // Run the three label checks in parallel — well below GitHub's secondary
  // rate-limit threshold for short concurrent bursts.
  await Promise.all(
    allLabels.map((label) => ensureLabel({ owner, repo, label, token, fetchImpl, logger })),
  );

  const existing = await findOpenIssueByLabel({
    owner,
    repo,
    label: sentryLabel,
    token,
    fetchImpl,
  });

  if (existing) {
    const commentBody = buildRecurrenceCommentBody({
      severity: analysis.severity,
      summary: analysis.ai_summary,
      apiErrorId,
      workflowRunUrl,
    });
    const created = await addIssueComment({
      owner,
      repo,
      issueNumber: existing.number,
      body: commentBody,
      token,
      fetchImpl,
    });
    logger.log?.(
      `[auto-issue] commented on existing issue #${existing.number} (sentry_issue_id=${sentryIssueId})`,
    );
    return {
      action: "commented",
      issueNumber: existing.number,
      commentId: created.id,
      html_url: created.html_url,
    };
  }

  const issueTitle = buildIssueTitle({
    severity: analysis.severity,
    title,
    sentryIssueId,
  });
  const issueBody = buildIssueBody({
    severity: analysis.severity,
    summary: analysis.ai_summary,
    rootCause: analysis.ai_root_cause ?? null,
    suggestedFix: analysis.ai_suggested_fix ?? null,
    suspectedFiles: analysis.ai_suspected_files ?? null,
    route,
    sentryIssueId,
    apiErrorId,
    workflowRunUrl,
  });
  const created = await createIssue({
    owner,
    repo,
    title: issueTitle,
    body: issueBody,
    labels: allLabels,
    token,
    fetchImpl,
  });
  logger.log?.(
    `[auto-issue] created new issue #${created.number} for sentry_issue_id=${sentryIssueId} (severity=${analysis.severity})`,
  );
  return {
    action: "created",
    issueNumber: created.number,
    html_url: created.html_url,
  };
}
