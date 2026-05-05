/**
 * `POST /api/webhooks/sentry` — Sentry Internal Integration の Webhook 受信。
 *
 * Sentry の Internal Integration 設定で発行される Client Secret を使った
 * HMAC-SHA256 署名 (`Sentry-Hook-Signature` ヘッダ) を検証してから、
 * ペイロードから集約サマリを抽出して `apiErrorService.upsertFromSentrySummary`
 * に渡す。署名検証に失敗した場合は 403、署名が取れているがペイロードから
 * `sentry_issue_id` を抽出できない場合は 200 を返す（Sentry の自動再送を
 * 招かないため）。
 *
 * Sentry Internal Integration webhook receiver. Verifies the
 * `Sentry-Hook-Signature` HMAC-SHA256 header against the configured Client
 * Secret in constant time, normalizes the payload, and forwards the summary
 * to `apiErrorService.upsertFromSentrySummary`. Returns 403 on signature
 * failure. Payloads we cannot map to a `sentry_issue_id` are acknowledged
 * with 200 (with `received: true, ignored: true`) so Sentry's automatic
 * retry policy does not loop on event types we don't handle yet.
 *
 * @see https://docs.sentry.io/organization/integrations/integration-platform/webhooks/
 * @see https://github.com/otomatty/zedi/issues/616
 * @see https://github.com/otomatty/zedi/issues/803
 */
import crypto from "node:crypto";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import {
  ApiErrorValidationError,
  getApiErrorBySentryIssueId,
  upsertFromSentrySummary,
} from "../../services/apiErrorService.js";
import { publishApiErrorUpdate } from "../../services/apiErrorBroadcaster.js";
import { readDispatchRepository, triggerRepositoryDispatch } from "../../lib/githubAppAuth.js";
import type { AppEnv } from "../../types/index.js";

const app = new Hono<AppEnv>();

/**
 * Sentry Webhook の署名 / リソースヘッダ名。
 * Header names used by Sentry Internal Integration webhooks.
 */
const SIGNATURE_HEADER = "sentry-hook-signature";
const RESOURCE_HEADER = "sentry-hook-resource";

/**
 * 与えられた raw body と Client Secret から HMAC-SHA256 hex 署名を計算する。
 *
 * Compute the expected HMAC-SHA256 hex signature for the given raw body using
 * the Sentry Internal Integration Client Secret.
 */
function computeSignature(rawBody: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
}

/**
 * 署名ヘッダ値を一定時間で比較する。長さ不一致や hex デコード失敗は false。
 *
 * Constant-time compare a Sentry signature header against the expected HMAC.
 * Returns false on length mismatch or hex decode failure (instead of throwing)
 * so webhooks with malformed headers fail closed without leaking timing.
 */
export function verifySentrySignature(
  rawBody: string,
  signatureHeader: string | undefined,
  secret: string,
): boolean {
  if (!signatureHeader || !secret) return false;
  const expected = computeSignature(rawBody, secret);
  // Hex 文字列同士で比較する。長さが違うと timingSafeEqual が throw するため
  // 先に Buffer の長さで弾く。
  // Compare as hex strings; timingSafeEqual throws on length mismatch so we
  // pre-check Buffer lengths to fail closed without leaking timing info.
  let expectedBuf: Buffer;
  let actualBuf: Buffer;
  try {
    expectedBuf = Buffer.from(expected, "hex");
    actualBuf = Buffer.from(signatureHeader, "hex");
  } catch {
    return false;
  }
  if (expectedBuf.length === 0 || expectedBuf.length !== actualBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, actualBuf);
}

/** 文字列でない値は null に正規化する / Coerce non-string values to null. */
function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/** 整数でなければ null に正規化する / Coerce to a finite integer or null. */
function asInteger(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && Number.isInteger(value)) return value;
  if (typeof value === "string" && /^-?\d+$/.test(value)) {
    const parsed = parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/**
 * オブジェクト型ガード。
 * Type guard for plain object lookups.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * 抽出後の正規化済みサマリ。`apiErrorService.upsertFromSentrySummary` の入力に使う。
 *
 * Normalized summary returned by `extractSentrySummary`; mirrors the subset of
 * `UpsertFromSentrySummaryInput` we can reliably derive from Sentry payloads.
 */
export interface SentrySummaryExtraction {
  sentryIssueId: string;
  title: string;
  fingerprint: string | null;
  route: string | null;
  statusCode: number | null;
}

/**
 * `event.tags` / `issue.tags` を共通フォーマット（key→value マップ）に正規化する。
 * Sentry は同一フィールドを「配列のタプル `[key,value]`」「`{key,value}` の配列」
 * 「平坦なオブジェクト」のいずれでも送ってくるため、抽出側で扱う前に統一する。
 *
 * Normalize Sentry's polymorphic `tags` shape (tuple-array, object-array, or
 * flat object) into a flat `Record<string, string>` so the extraction helpers
 * can use a single lookup path.
 */
function normalizeTags(rawTags: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (Array.isArray(rawTags)) {
    for (const t of rawTags) {
      if (Array.isArray(t) && typeof t[0] === "string" && typeof t[1] === "string") {
        out[t[0]] = t[1];
      } else if (isRecord(t) && typeof t.key === "string" && typeof t.value === "string") {
        out[t.key] = t.value;
      }
    }
  } else if (isRecord(rawTags)) {
    for (const [k, v] of Object.entries(rawTags)) {
      if (typeof v === "string") out[k] = v;
    }
  }
  return out;
}

/**
 * fingerprint の候補リストから最初に有効な値を返す。
 * 配列なら先頭の文字列、単純な文字列ならそのまま採用する。
 *
 * Pick the first usable fingerprint from a list of candidates (array of
 * strings → first element; string → as-is). Returns null when no candidate
 * has a usable shape.
 */
function pickFingerprint(candidates: readonly unknown[]): string | null {
  for (const c of candidates) {
    if (Array.isArray(c) && c.length > 0 && typeof c[0] === "string" && c[0].length > 0) {
      return c[0];
    }
    if (typeof c === "string" && c.length > 0) return c;
  }
  return null;
}

/**
 * `data.issue` / `data.event` / `data.group` / `data.id` の順に
 * Sentry issue ID を探す。なければ `null`。
 *
 * Locate the Sentry issue id from the well-known payload slots, in priority
 * order. Returns `null` when no slot has a non-empty string value — the caller
 * uses that as the signal to acknowledge with 200 + ignored.
 */
function extractSentryIssueId(
  data: Record<string, unknown>,
  issue: Record<string, unknown> | null,
  event: Record<string, unknown> | null,
  error: Record<string, unknown> | null,
): string | null {
  const group = isRecord(data.group) ? data.group : null;
  const eventIssue = event && isRecord(event.issue) ? event.issue : null;
  return (
    asString(issue?.id) ??
    asString(event?.issue_id) ??
    asString(eventIssue?.id) ??
    asString(error?.id) ??
    asString(group?.id) ??
    asString(data.id)
  );
}

/**
 * 与えられた URL を pathname だけに正規化する（origin / query / fragment を捨てる）。
 *
 * Reduce a URL string to just its pathname (origin / query / fragment stripped)
 * so we don't persist capability tokens or other request-specific bytes into
 * `api_errors.route`. Falls back to a manual split when the value is not a
 * fully-qualified URL.
 */
function urlToPath(url: string): string {
  try {
    return new URL(url).pathname || url;
  } catch {
    return url.split(/[?#]/, 1)[0] ?? url;
  }
}

/**
 * route 推定: `tags.transaction` → `issue.metadata.transaction` →
 * `issue.shortId` → `event.request.url`（pathname のみ） の順に試す。
 *
 * URL を最後の手段にしているのは Phase 1 の方針（Sentry 側でスクラブ済みの
 * 集約サマリだけ持つ）に従い、生 URL が `api_errors.route` に流入して
 * トークンやクエリ文字列が残るのを避けるため。
 *
 * Derive a `route` string from a Sentry payload. Priority: the `transaction`
 * tag, then issue metadata, then the issue short id, and finally `request.url`
 * reduced to its pathname. URLs are the last resort and always sanitized so
 * the column does not retain origins, query strings, or fragments — Phase 1
 * stores summary-only data so capability tokens and PII never persist here.
 */
function extractRoute(
  issue: Record<string, unknown> | null,
  event: Record<string, unknown> | null,
  tags: Record<string, string>,
): string | null {
  const metadata = isRecord(issue?.metadata) ? issue.metadata : null;
  if (tags.transaction) return tags.transaction;
  const metaTransaction = asString(metadata?.transaction);
  if (metaTransaction) return metaTransaction;
  const shortId = asString(issue?.shortId);
  if (shortId) return shortId;

  const request = event && isRecord(event.request) ? event.request : null;
  const reqUrl = asString(request?.url);
  if (!reqUrl) return null;
  const path = urlToPath(reqUrl);
  const reqMethod = asString(request?.method);
  return reqMethod ? `${reqMethod} ${path}` : path;
}

/**
 * HTTP ステータスコード推定: `event.contexts.response.status_code`
 * → `tags["response.status_code"]` → `tags["http.status_code"]` の順。
 *
 * Derive an HTTP status code from a Sentry payload. Looks at the response
 * context first, then standard tag names. Returns `null` when no recognized
 * field is present or the value is not a finite integer.
 */
function extractStatusCode(
  event: Record<string, unknown> | null,
  tags: Record<string, string>,
): number | null {
  const contexts = event && isRecord(event.contexts) ? event.contexts : null;
  const response = contexts && isRecord(contexts.response) ? contexts.response : null;
  const fromContexts = asInteger(response?.status_code);
  if (fromContexts !== null) return fromContexts;
  return asInteger(tags["response.status_code"]) ?? asInteger(tags["http.status_code"]);
}

/**
 * Sentry Webhook ペイロードから upsert 用サマリを抽出する。
 *
 * `data.issue` / `data.event` / `data.error` の順で issue ID 候補を探し、
 * 見つからなければ `null` を返す（呼び出し側が 200 + ignored で受理する）。
 * 取り出すフィールドはイベント種別をまたいで最も汎用なものに限定する
 * （title, route, statusCode, fingerprint）。
 *
 * Extract a normalized upsert summary from a Sentry webhook payload. Walks
 * the well-known `data.issue` → `data.event` → `data.error` slots, returns
 * `null` when no `sentry_issue_id` is available (caller acknowledges with
 * 200 + ignored). Extraction is intentionally minimal — title, route,
 * status code, fingerprint — covering Phase 1 event types.
 */
export function extractSentrySummary(payload: unknown): SentrySummaryExtraction | null {
  if (!isRecord(payload)) return null;
  const data = isRecord(payload.data) ? payload.data : null;
  if (!data) return null;

  const issue = isRecord(data.issue) ? data.issue : null;
  const event = isRecord(data.event) ? data.event : null;
  const error = isRecord(data.error) ? data.error : null;

  const sentryIssueId = extractSentryIssueId(data, issue, event, error);
  if (!sentryIssueId) return null;

  const title =
    asString(issue?.title) ??
    asString(event?.title) ??
    asString(error?.title) ??
    asString(data.title) ??
    "Sentry issue";

  const fingerprint = pickFingerprint([event?.fingerprint, issue?.fingerprint, data.fingerprint]);

  // tags を一度だけ正規化して route / statusCode 双方で使い回す。
  // Normalize tags once and share across route/statusCode extraction.
  const tags = normalizeTags(event?.tags ?? issue?.tags);

  return {
    sentryIssueId,
    title,
    fingerprint,
    route: extractRoute(issue, event, tags),
    statusCode: extractStatusCode(event, tags),
  };
}

/**
 * 新規 `sentry_issue_id` を初めて観測したときに `repository_dispatch`
 * (`event_type: analyze-error`) を発火する。Webhook レスポンスを遅らせない
 * よう必ず非 await で呼び出し、失敗時はログのみ残す。
 *
 * Trigger the `analyze-error` `repository_dispatch` event when a brand-new
 * Sentry issue lands. This MUST be called without `await` so the Sentry
 * webhook response is not delayed by GitHub round-trips. Configuration is
 * optional: if `GITHUB_DISPATCH_REPOSITORY` is unset we skip the dispatch
 * silently — issue #805 explicitly allows the AI workflow to be wired up
 * later without breaking this endpoint.
 */
async function dispatchAnalyzeError(
  apiErrorId: string,
  sentryIssueId: string,
  title: string,
  route: string | null,
): Promise<void> {
  const target = readDispatchRepository();
  if (!target) {
    // 未設定: Phase 2 の Actions が未デプロイの段階では正常系。
    // Unconfigured: a deliberate Phase 2 staging state where the Actions side
    // is not deployed yet. Skip without raising.
    console.log("[sentry-webhook] GITHUB_DISPATCH_REPOSITORY unset; skipping repository_dispatch");
    return;
  }
  await triggerRepositoryDispatch({
    eventType: "analyze-error",
    clientPayload: {
      api_error_id: apiErrorId,
      sentry_issue_id: sentryIssueId,
      title,
      route,
    },
    owner: target.owner,
    repo: target.repo,
  });
  console.log(
    `[sentry-webhook] repository_dispatch fired for issue=${sentryIssueId} target=${target.owner}/${target.repo}`,
  );
}

/**
 * POST /api/webhooks/sentry — Sentry Internal Integration 受信エンドポイント。
 * POST /api/webhooks/sentry — Sentry Internal Integration receiver.
 */
app.post("/", async (c) => {
  const secret = process.env.SENTRY_WEBHOOK_SECRET;
  if (!secret) {
    throw new HTTPException(500, { message: "Sentry webhook secret not configured" });
  }

  // 署名計算は raw body 必須。c.req.json() を呼ぶと Hono が body を消費するので
  // 先に text() で raw を取り出してから JSON.parse する。
  // Capture the raw body before parsing JSON; signature verification needs the
  // exact bytes Sentry signed.
  const rawBody = await c.req.text();
  const signatureHeader = c.req.header(SIGNATURE_HEADER);
  if (!verifySentrySignature(rawBody, signatureHeader, secret)) {
    console.error("[sentry-webhook] Signature verification failed");
    throw new HTTPException(403, { message: "Invalid webhook signature" });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const resource = c.req.header(RESOURCE_HEADER) ?? "unknown";
  const summary = extractSentrySummary(payload);
  if (!summary) {
    // 既知でない resource / 未対応イベントは 200 で受理する。Sentry は 4xx / 5xx
    // を見て自動リトライするため、こちらが処理対象外と判断したものは 200 を返す。
    // Acknowledge unhandled resources with 200; Sentry retries 4xx/5xx, and we
    // don't want to loop on event shapes Phase 1 doesn't cover.
    console.log(`[sentry-webhook] Ignored resource=${resource} (no sentry_issue_id)`);
    return c.json({ received: true, ignored: true });
  }

  const db = c.get("db");
  try {
    // 既存行の有無を upsert 前に判定する。`isNew === true` のときだけ
    // GitHub Actions の AI 解析ワークフローを起動し、再来時には起動しない。
    // 競合時は二重起動になり得るが、Phase 2 のワークフロー側で冪等に扱う前提。
    //
    // Detect first-sight before the upsert so we only kick off the AI analysis
    // workflow on net-new issues. Concurrent webhooks for the same id may both
    // observe `null` and both dispatch — Phase 2's workflow must dedupe on its
    // side; the trade-off keeps this path race-free of an additional lock.
    const existing = await getApiErrorBySentryIssueId(db, summary.sentryIssueId);
    const isNew = existing === null;

    const row = await upsertFromSentrySummary(db, {
      sentryIssueId: summary.sentryIssueId,
      title: summary.title,
      fingerprint: summary.fingerprint,
      route: summary.route,
      statusCode: summary.statusCode,
      occurrencesDelta: 1,
    });
    console.log(
      `[sentry-webhook] resource=${resource} upserted issue=${row.sentryIssueId} occurrences=${row.occurrences} isNew=${isNew}`,
    );
    // SSE 購読者へ最新行を配信 (Phase 2 / issue #807)。broadcaster は in-memory
    // なので Webhook の応答性に影響しない。
    // Fan out to SSE subscribers (Phase 2 / issue #807). Broadcaster is
    // synchronous + in-memory, so it doesn't slow down the webhook response.
    publishApiErrorUpdate(row);

    if (isNew) {
      // fire-and-forget: dispatch のレスポンスを await せずに 200 を返す。
      // dispatch 失敗は Sentry 側へリトライさせず、ログだけ残して握りつぶす
      // （Actions が未デプロイでも API がデグレしない、issue #805 受け入れ条件）。
      //
      // Fire-and-forget so the Sentry webhook's HTTP response doesn't block on
      // GitHub. Failures are logged, not thrown — issue #805 explicitly
      // requires the API to keep working even when the Actions workflow is not
      // deployed yet.
      void dispatchAnalyzeError(row.id, row.sentryIssueId, row.title, row.route ?? null).catch(
        (err) => {
          const message = err instanceof Error ? err.message : String(err);
          console.error(
            `[sentry-webhook] repository_dispatch failed for issue=${row.sentryIssueId}: ${message}`,
          );
        },
      );
    }

    return c.json({ received: true, id: row.id });
  } catch (err) {
    // 入力検証エラー (sentryIssueId / title / statusCode 等) は 400 で返す。
    // それ以外は 500 にフォールバックさせる。サービス層が型付きエラーを投げるので
    // メッセージ文字列に依存せず instanceof で分岐する。
    // Boundary validation errors → 400; anything else → bubble up to 500.
    // We branch on `instanceof ApiErrorValidationError` rather than parsing the
    // error message so service-side message tweaks don't accidentally flip
    // 400-eligible failures into 500s.
    const message = err instanceof Error ? err.message : "unknown error";
    console.error(`[sentry-webhook] Failed to upsert: ${message}`);
    if (err instanceof ApiErrorValidationError) {
      return c.json({ error: message }, 400);
    }
    throw err;
  }
});

export default app;
