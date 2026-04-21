/**
 * マジックリンクサービス — Better Auth の `magicLink` プラグインに送信依頼するラッパー。
 *
 * Magic-link service — thin wrapper that asks the Better Auth `magicLink`
 * plugin to generate and deliver a sign-in link for the given email.
 *
 * 招待メール mismatch 時の救済フローなど、サーバー内部から
 * `POST /api/auth/sign-in/magic-link` を叩く場合に利用する。
 * Used when the server needs to trigger the Better Auth magic-link send
 * internally (e.g. the invite mismatch rescue flow) instead of the client
 * calling it directly.
 */
import { auth } from "../auth.js";
import { getEnv } from "../lib/env.js";
import type { Locale } from "../emails/locales/index.js";

/**
 * 送信パラメータ / Send parameters.
 */
export interface SendInvitationMagicLinkParams {
  /** 宛先 / Recipient email address */
  email: string;
  /** サインイン後のリダイレクト先 / Redirect target after sign-in */
  callbackURL: string;
  /**
   * メール本文のロケール。省略時は `ja`。 `sendMagicLink` コールバックに渡す
   * リクエストの `Accept-Language` ヘッダ経由で伝える。
   * Locale used for the delivered email body. Propagated via the
   * Accept-Language header so the `sendMagicLink` callback can pick it up.
   */
  locale?: Locale;
}

/**
 * 送信結果 / Send result.
 */
export interface SendInvitationMagicLinkResult {
  /** 送信に成功したか / Whether Better Auth accepted the request */
  sent: boolean;
  /** エラーメッセージ / Error message (if any) */
  error?: string;
  /** Better Auth が返した HTTP ステータス / Status code returned by Better Auth */
  status?: number;
}

/**
 * Better Auth の magicLink サインインエンドポイントを内部呼び出しして
 * 招待先メール宛にワンタイムサインインリンクを送る。
 *
 * Internally invokes Better Auth's magic-link sign-in endpoint so the
 * invited email receives a one-time sign-in link.
 */
export async function sendInvitationMagicLink(
  params: SendInvitationMagicLinkParams,
): Promise<SendInvitationMagicLinkResult> {
  const baseUrl = getEnv("BETTER_AUTH_URL").replace(/\/$/, "");
  const locale = params.locale ?? "ja";
  const request = new Request(`${baseUrl}/api/auth/sign-in/magic-link`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "accept-language": locale,
    },
    body: JSON.stringify({
      email: params.email,
      callbackURL: params.callbackURL,
    }),
  });

  try {
    const response = await auth.handler(request);
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      return {
        sent: false,
        status: response.status,
        error: body || `Magic-link request failed with status ${response.status}`,
      };
    }
    return { sent: true, status: response.status };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[magicLinkService] Unexpected error sending magic link:", message);
    return { sent: false, error: message };
  }
}
