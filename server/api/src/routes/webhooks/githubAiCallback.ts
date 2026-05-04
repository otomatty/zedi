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
  updateAiAnalysis,
  type UpdateAiAnalysisInput,
} from "../../services/apiErrorService.js";
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
  try {
    const updated = await updateAiAnalysis(db, { id, ...normalized });
    if (!updated) {
      return c.json({ error: "Not found" }, 404);
    }
    console.log(
      `[github-ai-callback] updated api_error=${updated.id} severity=${updated.severity}`,
    );
    return c.json({ error: updated });
  } catch (err) {
    if (err instanceof ApiErrorAiAnalysisValidationError) {
      return c.json({ error: err.message }, 400);
    }
    throw err;
  }
});

export default app;
