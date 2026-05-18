/**
 * 重要 API エラー通知サービス (Epic #616 Phase 3 / sub-issue #809)。
 *
 * AI 解析後に severity が `high` / `medium` と判定された `api_errors` 行に対し、
 * 運用担当の通知メールアドレスへ薄いサマリ（sentry_issue_id, severity, 管理画面
 * URL）をメールで送る。Slack は本リポジトリでは使わないためサポートしない。
 *
 * 設計方針:
 * - 環境変数（`MONITORING_NOTIFY_EMAIL`）が未設定なら no-op。本番投入前のステー
 *   ジング段階でも例外を出さずに動かせる。
 * - severity が `high` / `medium` 以外（`low`, `unknown`）は no-op。Phase 3 の
 *   通知は P1/P2 と整合する重大度のみ対象。
 * - 本文に Authorization / Cookie / raw email など PII を載せない。本サービスに
 *   渡すのは集約済みサマリ (`title`, `sentryIssueId`, `severity`) と管理画面 URL
 *   構築に必要な `apiErrorId` のみ。
 * - 内部 URL（API ホスト等）は本文に含めない。`ADMIN_BASE_URL` のみ参照する。
 * - 二重通知防止のため呼び出し側で 1 箇所に集約する想定（githubAiCallback の
 *   `updateAiAnalysis` 成功直後）。
 *
 * Email-only alerter for high-impact API errors (Epic #616 Phase 3 / #809).
 * Slack is intentionally unsupported in this repo. The notifier is no-op when
 * `MONITORING_NOTIFY_EMAIL` is unset or when severity is not `high`/`medium`,
 * so it can ship before staging configuration is finalized. The body contains
 * only summary fields (sentry_issue_id, severity, title) and the public admin
 * URL — Authorization / Cookie / raw email values are never propagated here.
 *
 * @see ./emailService.ts
 * @see ../routes/webhooks/githubAiCallback.ts
 * @see https://github.com/otomatty/zedi/issues/616
 * @see https://github.com/otomatty/zedi/issues/809
 */
import { getOptionalEnv } from "../lib/env.js";
import type { ApiErrorSeverity } from "../schema/apiErrors.js";
import { sendEmail } from "./emailService.js";

/**
 * 通知対象とする severity。Phase 3 では `high` と `medium` のみ。
 * Severities that trigger an alert. Phase 3 covers `high` and `medium` only.
 */
const NOTIFIABLE_SEVERITIES: readonly ApiErrorSeverity[] = ["high", "medium"];

/**
 * `notifyApiErrorAlert` の入力。呼び出し側 (githubAiCallback) は
 * `updateAiAnalysis` の戻り行から必要なフィールドだけを抜き出して渡す。
 *
 * Input payload for `notifyApiErrorAlert`. Callers (githubAiCallback) extract
 * only the fields they need from the post-update `api_errors` row. Internal
 * URLs / capability tokens / raw user data must not be passed in.
 */
export interface NotifyApiErrorAlertPayload {
  /** `api_errors.id`（管理画面 URL 構築に使う） / api_errors row id */
  apiErrorId: string;
  /** Sentry issue id（本文と件名に出す） / Sentry issue id (rendered in body) */
  sentryIssueId: string;
  /** AI 解析後の severity / AI-derived severity */
  severity: ApiErrorSeverity;
  /** 短いタイトル（PII を含まない要約） / Short, PII-free error title */
  title: string;
}

/**
 * 通知結果。メール経路の send 結果のみ返す（Slack は未対応）。
 *
 * Result of a `notifyApiErrorAlert` call. Only the email channel is reported
 * because Slack is intentionally unsupported in this repo. `sent: false` with
 * no `error` indicates an intentional skip (no-op path).
 */
export interface NotifyApiErrorAlertResult {
  email: {
    /** 送信を実行したか / Whether an email was actually sent */
    sent: boolean;
    /** Resend が返したメール ID / Email id returned by Resend (on success) */
    id?: string;
    /** 失敗時のエラーメッセージ / Error message when send failed */
    error?: string;
  };
}

/**
 * HTML エスケープ。件名・本文に挿入する値はすべてここを通す。
 * Escape user-controlled text before injecting into the HTML body.
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * 末尾スラッシュを取り除き、`http(s)` スキームのみを許可した正規化済み
 * base URL を返す。`javascript:` 等の危険なスキームや URL として解析不能な
 * 値は null にフォールバックして、本文に埋め込まれないようにする。
 *
 * Normalize a base URL: strip trailing slashes and only accept the `http:` /
 * `https:` schemes. Anything else (`javascript:`, `data:`, malformed input,
 * etc.) returns null so it never lands in alert HTML — operator-controlled
 * env var, but defense in depth keeps a config typo from producing a clickable
 * non-HTTP link in an email body.
 */
function normalizeBaseUrl(raw: string): string | null {
  const trimmed = raw.trim().replace(/\/+$/, "");
  if (trimmed.length === 0) return null;
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
  // 正規化済み URL を再合成。pathname が "/" のときは省略する。
  // Reassemble from parsed components; drop a bare `/` pathname.
  const path = parsed.pathname === "/" ? "" : parsed.pathname.replace(/\/+$/, "");
  return `${parsed.origin}${path}`;
}

/**
 * 件名と HTML 本文を組み立てる。本文に含めるのは
 *   - sentry_issue_id
 *   - severity
 *   - title
 *   - 管理画面 URL（ADMIN_BASE_URL 設定時のみ）
 * のみ。Authorization / Cookie / raw email / 内部 URL は呼び出し側でも
 * 当サービス内でも参照しない。
 *
 * Build subject + HTML body for the alert email. Only sentry_issue_id,
 * severity, title, and the public admin URL (when `ADMIN_BASE_URL` is set)
 * are rendered. Authorization, Cookie, raw email, and internal URLs are
 * never referenced — by contract this function takes only the fields it
 * renders.
 */
function buildEmail(payload: NotifyApiErrorAlertPayload): { subject: string; html: string } {
  const adminBase = normalizeBaseUrl(getOptionalEnv("ADMIN_BASE_URL"));
  const adminUrl = adminBase ? `${adminBase}/errors/${payload.apiErrorId}` : null;

  // 件名から CR/LF を取り除いて、メール送信ライブラリが SMTP ヘッダ化する
  // 際の header injection (RFC 5322 folding 悪用) を防ぐ。Resend は JSON で
  // 受けるため現状は発火しないが、防御を 1 段噛ませてもコストはほぼゼロ。
  //
  // Strip CR/LF from the subject as defense-in-depth against SMTP header
  // injection. Resend takes the subject as a JSON field today so this isn't
  // exploitable now, but the cost is one regex and the behavior holds even
  // if we ever swap mail transports.
  const subject = `[zedi:${payload.severity}] API error ${payload.sentryIssueId}`.replace(
    /[\r\n]+/g,
    " ",
  );

  const lines: string[] = [
    `<p><strong>severity:</strong> ${escapeHtml(payload.severity)}</p>`,
    `<p><strong>sentry_issue_id:</strong> ${escapeHtml(payload.sentryIssueId)}</p>`,
    `<p><strong>title:</strong> ${escapeHtml(payload.title)}</p>`,
  ];
  if (adminUrl) {
    const safeUrl = escapeHtml(adminUrl);
    lines.push(`<p><a href="${safeUrl}">${safeUrl}</a></p>`);
  }
  return { subject, html: lines.join("\n") };
}

/**
 * 重要 API エラーをメール通知する。Slack は使わない。
 *
 * - severity が `high` / `medium` 以外なら no-op。
 * - `MONITORING_NOTIFY_EMAIL` が未設定なら no-op。
 * - emailService 側のエラーは握りつぶし、`result.email.error` で返す
 *   （通知失敗で呼び出し元（webhook 応答）を 500 にしないため）。
 *
 * Send an email alert for a high-impact API error. Slack is not supported.
 * The notifier short-circuits to a no-op when severity is `low`/`unknown` or
 * when `MONITORING_NOTIFY_EMAIL` is unset. Email failures are swallowed and
 * surfaced via `result.email.error` so a notification outage does not turn the
 * upstream webhook response into a 500.
 *
 * @param payload - 通知に必要なサマリ / Alert summary fields
 * @returns 送信結果 / Per-channel delivery result
 */
export async function notifyApiErrorAlert(
  payload: NotifyApiErrorAlertPayload,
): Promise<NotifyApiErrorAlertResult> {
  if (!NOTIFIABLE_SEVERITIES.includes(payload.severity)) {
    return { email: { sent: false } };
  }

  const to = getOptionalEnv("MONITORING_NOTIFY_EMAIL").trim();
  if (!to) {
    console.warn(
      "[notifier] MONITORING_NOTIFY_EMAIL is not set; skipping alert for sentry_issue_id=",
      payload.sentryIssueId,
    );
    return { email: { sent: false } };
  }

  const { subject, html } = buildEmail(payload);

  try {
    const sendResult = await sendEmail({ to, subject, html });
    if (!sendResult.success) {
      console.error(
        `[notifier] email send failed for sentry_issue_id=${payload.sentryIssueId}: ${sendResult.error ?? "unknown error"}`,
      );
      return { email: { sent: false, error: sendResult.error } };
    }
    console.log(
      `[notifier] alert email sent for sentry_issue_id=${payload.sentryIssueId} severity=${payload.severity}`,
    );
    return { email: { sent: true, id: sendResult.id } };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      `[notifier] unexpected error sending alert for sentry_issue_id=${payload.sentryIssueId}: ${message}`,
    );
    return { email: { sent: false, error: message } };
  }
}
