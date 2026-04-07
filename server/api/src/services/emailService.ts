/**
 * メール送信サービス — Resend 統合
 * Email sending service — Resend integration
 */
import { Resend } from "resend";
import { getOptionalEnv } from "../lib/env.js";

let resendClient: Resend | null = null;

/**
 * Resend クライアントを取得する（遅延初期化）
 * Get the Resend client (lazy initialization)
 */
function getResendClient(): Resend | null {
  if (resendClient) return resendClient;

  const apiKey = getOptionalEnv("RESEND_API_KEY");
  if (!apiKey) {
    console.warn("[emailService] RESEND_API_KEY is not set. Email sending is disabled.");
    return null;
  }

  resendClient = new Resend(apiKey);
  return resendClient;
}

/**
 * メールの送信パラメータ
 * Email sending parameters
 */
export interface SendEmailParams {
  /** 宛先メールアドレス / Recipient email address */
  to: string;
  /** 件名 / Subject */
  subject: string;
  /** HTML 本文 / HTML body */
  html: string;
}

/**
 * メールの送信結果
 * Email sending result
 */
export interface SendEmailResult {
  /** 送信成功したか / Whether the email was sent successfully */
  success: boolean;
  /** Resend が返すメール ID / Email ID returned by Resend */
  id?: string;
  /** エラーメッセージ / Error message */
  error?: string;
}

/**
 * メールを送信する
 * Send an email
 *
 * @param params - 送信パラメータ / Sending parameters
 * @returns 送信結果 / Sending result
 */
export async function sendEmail(params: SendEmailParams): Promise<SendEmailResult> {
  const client = getResendClient();
  if (!client) {
    console.warn("[emailService] Email sending is disabled (no API key). Skipping email to:", params.to);
    return { success: false, error: "Email sending is disabled (RESEND_API_KEY not set)" };
  }

  const from = getOptionalEnv("RESEND_FROM_EMAIL", "noreply@zedi-note.app");

  try {
    const { data, error } = await client.emails.send({
      from,
      to: params.to,
      subject: params.subject,
      html: params.html,
    });

    if (error) {
      console.error("[emailService] Resend API error:", error);
      return { success: false, error: error.message };
    }

    return { success: true, id: data?.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[emailService] Unexpected error sending email:", message);
    return { success: false, error: message };
  }
}

/**
 * テスト用: Resend クライアントをリセットする
 * For testing: reset the Resend client
 */
export function _resetClient(): void {
  resendClient = null;
}
