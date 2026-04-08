/**
 * 招待サービス — トークン生成・メール送信
 * Invitation service — token generation & email sending
 */
import { eq } from "drizzle-orm";
import { noteInvitations, notes, users } from "../schema/index.js";
import { sendEmail } from "./emailService.js";
import { renderInviteNoteEmail, getInviteNoteSubject } from "../emails/invite-note.js";
import { getOptionalEnv } from "../lib/env.js";
import type { Database } from "../types/index.js";
import type { Locale } from "../emails/locales/index.js";

/** 招待トークンの有効期間（7日） / Invitation token TTL (7 days) */
const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * 暗号学的に安全なランダムトークンを生成する
 * Generate a cryptographically secure random token
 */
function generateToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * 招待メール送信のパラメータ
 * Parameters for sending an invitation email
 */
export interface SendInvitationParams {
  /** データベース接続 / Database connection */
  db: Database;
  /** ノート ID / Note ID */
  noteId: string;
  /** 招待先メールアドレス / Invitee email address */
  memberEmail: string;
  /** 付与するロール / Role to assign */
  role: string;
  /** 招待者のユーザー ID / Inviter's user ID */
  invitedByUserId: string;
}

/**
 * 招待メール送信の結果
 * Result of sending an invitation email
 */
export interface SendInvitationResult {
  /** メール送信に成功したか / Whether the email was sent successfully */
  sent: boolean;
  /** エラーメッセージ / Error message (if any) */
  error?: string;
}

/**
 * 招待トークンを生成し、メールを送信する
 * Generate an invitation token and send the email
 *
 * @param params - 送信パラメータ / Sending parameters
 * @returns 送信結果 / Sending result
 */
export async function sendInvitation(params: SendInvitationParams): Promise<SendInvitationResult> {
  const { db, noteId, memberEmail, role, invitedByUserId } = params;

  try {
    // ノートタイトルを取得 / Fetch note title
    const [note] = await db
      .select({ title: notes.title })
      .from(notes)
      .where(eq(notes.id, noteId))
      .limit(1);
    const noteTitle = note?.title ?? "Untitled";

    // 招待者の名前を取得 / Fetch inviter's display name
    const [inviter] = await db
      .select({ name: users.name })
      .from(users)
      .where(eq(users.id, invitedByUserId))
      .limit(1);
    const inviterName = inviter?.name ?? "Unknown";

    // トークン生成 + DB 保存（upsert） / Generate token + upsert into DB
    const token = generateToken();
    const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);

    await db
      .insert(noteInvitations)
      .values({ noteId, memberEmail, token, expiresAt })
      .onConflictDoUpdate({
        target: [noteInvitations.noteId, noteInvitations.memberEmail],
        set: { token, expiresAt, usedAt: null },
      });

    // 招待 URL を構築 / Build invitation URL
    const baseUrl = getOptionalEnv("APP_URL", "https://zedi-note.app");
    const inviteUrl = `${baseUrl}/invite?token=${token}`;

    // デフォルトロケール（ユーザーテーブルに locale なし） / Default locale (no locale column in users table)
    const locale: Locale = "ja";

    // メールをレンダリングして送信 / Render and send email
    const subject = getInviteNoteSubject({
      inviterName,
      noteTitle,
      locale,
    });
    const html = await renderInviteNoteEmail({
      noteTitle,
      inviterName,
      role,
      inviteUrl,
      locale,
    });

    const result = await sendEmail({ to: memberEmail, subject, html });

    if (!result.success) {
      console.error(
        `[invitationService] Failed to send invitation email to ${memberEmail}:`,
        result.error,
      );
      return { sent: false, error: result.error };
    }

    return { sent: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      `[invitationService] Unexpected error sending invitation to ${memberEmail}:`,
      message,
    );
    return { sent: false, error: message };
  }
}

/**
 * 招待メールを再送信する（トークン再生成 + expires_at リセット）
 * Resend an invitation email (regenerate token + reset expires_at)
 *
 * @param params - 送信パラメータ / Sending parameters
 * @returns 送信結果 / Sending result
 */
export async function resendInvitation(
  params: SendInvitationParams,
): Promise<SendInvitationResult> {
  // 再送信はトークン再生成を伴うため、sendInvitation と同じロジックで OK
  // Resend uses the same logic since it regenerates the token
  return sendInvitation(params);
}
