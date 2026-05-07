/**
 * `PUT /api/webhooks/github/ai-result/:id` — GitHub Actions の AI 解析ワークフロー
 * から結果を受け取るコールバック (Epic #616 Phase 2 / sub-issue #805)。
 *
 * 認証は GitHub App の installation access token のみ受け付ける
 * (`Authorization: Bearer ghs_...`)。受信した token は GitHub API に問い合わせて
 * 当アプリのインストール ID と一致するかを検証してから DB に書き戻す。
 *
 * Callback endpoint hit by the GitHub Actions AI analysis workflow when it has
 * results for a given `api_errors` row (Epic #616 Phase 2 / issue #805).
 * Authentication is GitHub App installation tokens only — the bearer token is
 * round-tripped to GitHub for validation, and we additionally require the
 * resulting installation id to match `GITHUB_APP_INSTALLATION_ID` so a token
 * minted by an unrelated installation cannot impersonate ours.
 *
 * @see ../../lib/githubAppAuth.ts
 * @see ../../services/apiErrorService.ts
 * @see https://github.com/otomatty/zedi/issues/616
 * @see https://github.com/otomatty/zedi/issues/805
 */
import { Hono } from "hono";
import {
  ApiErrorAiAnalysisValidationError,
  getApiErrorById,
  updateAiAnalysis,
  type UpdateAiAnalysisInput,
} from "../../services/apiErrorService.js";
import type { ApiErrorSeverity } from "../../schema/apiErrors.js";
import { publishApiErrorUpdate } from "../../services/apiErrorBroadcaster.js";
import { notifyApiErrorAlert } from "../../services/notifier.js";
import { verifyInstallationToken } from "../../lib/githubAppAuth.js";
import type { AppEnv } from "../../types/index.js";

const app = new Hono<AppEnv>();

/**
 * 受け付ける UUID 形式（v1〜v5）。`api_errors.id` は `uuid` 型なので
 * 不正な形式が来た時点で 404 を返し、Postgres まで投げない。
 *
 * RFC 4122 UUID matcher (any version). `api_errors.id` is a Postgres `uuid`
 * column, so reject malformed values early to keep the route resilient.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Phase 3 / #809 で通知対象となる severity の集合。
 * Severity values that warrant an email alert (Phase 3 / #809).
 */
const NOTIFIABLE_SEVERITIES: ReadonlySet<ApiErrorSeverity> = new Set(["high", "medium"]);

/**
 * 1 行に対する通知を「冪等な再送 / 部分更新では再発火させない」ためのガード。
 * `prev` が notifiable で `next` も notifiable のとき（例: high→high の冪等
 * 再送、medium→high のエスカレート）は false を返す。`prev` が notifiable
 * でなく `next` が notifiable のときだけ true。これにより 1 行あたり最大
 * 1 通の運用通知に揃える。
 *
 * Returns true only when severity transitions from a non-notifiable value
 * (`low` / `unknown`) into `high` or `medium`. Idempotent retries
 * (high → high) and lateral moves between notifiable levels (medium → high)
 * deliberately return false so each row produces at most one operational
 * email over its lifetime.
 */
export function severityBecameNotifiable(prev: ApiErrorSeverity, next: ApiErrorSeverity): boolean {
  return !NOTIFIABLE_SEVERITIES.has(prev) && NOTIFIABLE_SEVERITIES.has(next);
}

/**
 * `Authorization: Bearer ...` ヘッダから token を抜き出す。
 * Extract the bearer token from an `Authorization` header value, or null when
 * the header is missing or malformed.
 */
function extractBearerToken(header: string | undefined): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (!match) return null;
  const token = match[1]?.trim();
  return token && token.length > 0 ? token : null;
}

/**
 * リクエスト body を `UpdateAiAnalysisInput` に正規化する。受け付けるフィールド:
 * `ai_summary`, `ai_suspected_files`, `ai_root_cause`, `ai_suggested_fix`,
 * `severity`。snake_case / camelCase の両方を許容する（GitHub Actions 側の
 * 実装次第で揺れるため）。
 *
 * Normalize the JSON body into a `UpdateAiAnalysisInput`. Accepts both
 * `snake_case` (canonical for GitHub Actions YAML) and `camelCase` (matches the
 * service-layer field names) so the workflow author isn't forced into one
 * style. Unknown keys are ignored.
 */
function normalizeBody(body: unknown): Omit<UpdateAiAnalysisInput, "id"> | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const b = body as Record<string, unknown>;
  const out: Omit<UpdateAiAnalysisInput, "id"> = {};
  const aiSummary = b.ai_summary ?? b.aiSummary;
  if (aiSummary !== undefined) {
    out.aiSummary = aiSummary === null ? null : String(aiSummary);
  }
  const aiRootCause = b.ai_root_cause ?? b.aiRootCause;
  if (aiRootCause !== undefined) {
    out.aiRootCause = aiRootCause === null ? null : String(aiRootCause);
  }
  const aiSuggestedFix = b.ai_suggested_fix ?? b.aiSuggestedFix;
  if (aiSuggestedFix !== undefined) {
    out.aiSuggestedFix = aiSuggestedFix === null ? null : String(aiSuggestedFix);
  }
  const aiSuspectedFiles = b.ai_suspected_files ?? b.aiSuspectedFiles;
  if (aiSuspectedFiles !== undefined) {
    // 構造の検証は service 層 (`updateAiAnalysis`) で行う。ここでは `undefined`
    // との区別だけ通す。
    // Defer per-entry shape validation to the service layer; here we only need
    // to distinguish "field present" from "field omitted".
    out.aiSuspectedFiles = aiSuspectedFiles as UpdateAiAnalysisInput["aiSuspectedFiles"];
  }
  const severity = b.severity;
  if (severity !== undefined) {
    out.severity = severity as UpdateAiAnalysisInput["severity"];
  }
  return out;
}

/**
 * PUT /:id — AI 解析結果の書き戻し。
 * PUT /:id — write back AI analysis output for a specific `api_errors` row.
 *
 * - 401: missing / malformed bearer token
 * - 403: token did not validate against our GitHub App installation
 * - 503: transient GitHub-side failure (5xx / timeout / network) — caller
 *   should retry; we never silently turn outages into 403s.
 * - 400: invalid JSON, invalid severity, or malformed `ai_suspected_files`
 * - 404: no row matches `:id` (or `:id` is not a UUID)
 * - 200: returned the post-update row
 */
app.put("/:id", async (c) => {
  const id = c.req.param("id");
  if (!UUID_RE.test(id)) {
    return c.json({ error: "Not found" }, 404);
  }

  const token = extractBearerToken(c.req.header("authorization"));
  if (!token) {
    return c.json({ error: "Missing or malformed Authorization header" }, 401);
  }

  // GitHub Actions から渡された installation token を GitHub 側で検証する。
  // 検証には外部 API 呼び出しが必要なので、未認証アクセスがある場合に攻撃者が
  // 大量にこの分岐を叩き続けて GitHub の rate limit を消費しないよう、
  // 直前で UUID / Authorization ヘッダ形式を済ませている。
  //
  // Round-trip the bearer token through GitHub's API to confirm it belongs to
  // our App installation. We deliberately gate the upstream call behind the
  // UUID + bearer-format checks above so a flood of malformed requests can't
  // burn through our GitHub rate limit before being rejected.
  let valid: boolean;
  try {
    valid = await verifyInstallationToken(token);
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    console.error(`[github-ai-callback] verifyInstallationToken failed: ${message}`);
    return c.json({ error: "Token verification failed" }, 503);
  }
  if (!valid) {
    return c.json({ error: "Invalid installation token" }, 403);
  }

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid JSON body" }, 400);
  }
  const normalized = normalizeBody(body);
  if (!normalized) {
    return c.json({ error: "body must be a JSON object" }, 400);
  }

  const db = c.get("db");
  // Phase 3 / #809 の通知は「severity が初めて high/medium に到達したとき」
  // のみ発火させる。`updateAiAnalysis` は冪等なので、リトライや severity を
  // 含まない部分更新のたびに通知すると重複アラートが発生する。よって
  // UPDATE 前に行を読み、pre.severity と updated.severity を比較する。
  // 行が無ければここで 404 を返し、後続の UPDATE を発行しない。
  //
  // Phase 3 / #809: only alert when severity *transitions* into high/medium
  // for the first time. `updateAiAnalysis` is idempotent — retries or partial
  // callbacks (e.g. an empty body or a callback that only refreshes
  // `ai_summary`) would otherwise resend the alert. We read the row first so
  // we can compare pre vs post severity, and so a missing row short-circuits
  // before the UPDATE.
  const pre = await getApiErrorById(db, id);
  if (!pre) {
    return c.json({ error: "Not found" }, 404);
  }
  try {
    const updated = await updateAiAnalysis(db, { id, ...normalized });
    if (!updated) {
      return c.json({ error: "Not found" }, 404);
    }
    console.log(
      `[github-ai-callback] updated api_error=${updated.id} severity=${updated.severity}`,
    );
    // SSE 購読者へ AI 解析結果を配信 (Phase 2 / issue #807)。
    // Notify SSE subscribers so the admin UI updates without a page reload.
    publishApiErrorUpdate(updated);
    // 重要エラーのメール通知 (Phase 3 / issue #809)。`pre.severity` が
    // notifiable でなく、かつ `updated.severity` が notifiable のときだけ
    // 1 回だけ発火する。冪等な再送やエスカレート済み行への部分更新では
    // 発火しない。`MONITORING_NOTIFY_EMAIL` 未設定時は notifier 側で no-op。
    //
    // Email alert for high-impact errors (Phase 3 / #809). Fires exactly when
    // severity transitions from a non-notifiable value (`low` / `unknown` /
    // null) into `high` or `medium`. Idempotent retries and partial updates
    // on already-escalated rows are deliberate no-ops here. The notifier
    // itself further no-ops when `MONITORING_NOTIFY_EMAIL` is unset.
    if (severityBecameNotifiable(pre.severity, updated.severity)) {
      // fire-and-forget: notifier 側でエラーは swallow 済み。webhook 応答を
      // Resend 呼び出しで遅延させない。
      // fire-and-forget so the webhook response doesn't await Resend; the
      // notifier itself swallows transport errors.
      void notifyApiErrorAlert({
        apiErrorId: updated.id,
        sentryIssueId: updated.sentryIssueId,
        severity: updated.severity,
        title: updated.title,
      });
    }
    // 外部 (GitHub Actions) 向けの webhook なので、`error` キーを成功時に流用する
    // 内部 admin API の慣習ではなく、`data` キーで返して "error 有無で失敗判定"
    // できる素直な形にする（admin/src/api/admin.ts と異なり消費者がまだ存在しない）。
    //
    // External GitHub-Actions-facing webhook: don't reuse the admin route's
    // `{ error: row }` success shape — it's confusing for outside consumers
    // (presence-of-`error` no longer means failure). Use `data` so the
    // response shape is unambiguous. No backward-compat concern: the AI
    // workflow that calls this endpoint hasn't been written yet.
    return c.json({ data: updated });
  } catch (err) {
    if (err instanceof ApiErrorAiAnalysisValidationError) {
      return c.json({ error: err.message }, 400);
    }
    throw err;
  }
});

export default app;
