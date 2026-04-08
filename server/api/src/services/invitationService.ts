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
  /**
   * データベース接続（`db.transaction` 内のクライアントでも可）
   * Database connection (may be a transaction-scoped client)
   */
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
 * メール送信用に DB でトークンを upsert し、テンプレートへ渡すコンテキストを組み立てる。
 * Build email context by upserting a token in the DB (no external I/O).
 *
 * 再送ルートではトランザクション内で呼び、コミット後に `deliverInvitationEmail` を実行する。
 * For resend, call inside a transaction, then `deliverInvitationEmail` after commit.
 */
export interface InvitationEmailContext {
  /** 宛先 / Recipient */
  memberEmail: string;
  /** 付与ロール / Assigned role */
  role: string;
  /** 招待 URL / Invitation URL including token */
  inviteUrl: string;
  /** ノート表示名 / Note title for template */
  noteTitle: string;
  /** 招待者表示名 / Inviter display name */
  inviterName: string;
  /** メールロケール / Email locale */
  locale: Locale;
}

/**
 * `upsertInvitationTokenInDb` の結果（成功時はメール送信前のコンテキスト）
 * Result of DB upsert before sending email.
 */
export type UpsertInvitationTokenResult =
  | { ok: true; context: InvitationEmailContext }
  | { ok: false; error: string };

/**
 * トークン upsert の本体。例外は呼び出し元へ伝播する（トランザクション内ではロールバック用）。
 * Core token upsert; errors propagate (so transactions roll back).
 */
async function upsertInvitationTokenDbImpl(
  params: SendInvitationParams,
): Promise<InvitationEmailContext> {
  const { db, noteId, memberEmail, role, invitedByUserId } = params;

  const [note] = await db
    .select({ title: notes.title })
    .from(notes)
    .where(eq(notes.id, noteId))
    .limit(1);
  const noteTitle = note?.title ?? "Untitled";

  const [inviter] = await db
    .select({ name: users.name })
    .from(users)
    .where(eq(users.id, invitedByUserId))
    .limit(1);
  const inviterName = inviter?.name ?? "Unknown";

  const token = generateToken();
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);

  await db
    .insert(noteInvitations)
    .values({ noteId, memberEmail, token, expiresAt })
    .onConflictDoUpdate({
      target: [noteInvitations.noteId, noteInvitations.memberEmail],
      set: { token, expiresAt, usedAt: null },
    });

  const baseUrl = getOptionalEnv("APP_URL", "https://zedi-note.app");
  const inviteUrl = `${baseUrl}/invite?token=${token}`;
  const locale: Locale = "ja";

  return {
    memberEmail,
    role,
    inviteUrl,
    noteTitle,
    inviterName,
    locale,
  };
}

/**
 * トークンを生成して DB に保存し、メール送信用コンテキストを返す（メールは送らない）。
 * 失敗時は `{ ok: false }` を返し、例外は飲み込む（バックグラウンド `sendInvitation` 向け）。
 * Generate a token, upsert into DB, return context for email (does not send email).
 * On failure returns `{ ok: false }` (for background `sendInvitation`).
 */
export async function upsertInvitationTokenInDb(
  params: SendInvitationParams,
): Promise<UpsertInvitationTokenResult> {
  try {
    const context = await upsertInvitationTokenDbImpl(params);
    return { ok: true, context };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      `[invitationService] Unexpected error upserting invitation for ${params.memberEmail}:`,
      message,
    );
    return { ok: false, error: message };
  }
}

/**
 * トランザクション内で使用する。DB 失敗は例外として伝播し、tx をロールバックさせる。
 * Use inside a transaction: DB failures propagate so the transaction rolls back.
 */
export async function upsertInvitationTokenInDbThrowing(
  params: SendInvitationParams,
): Promise<InvitationEmailContext> {
  return upsertInvitationTokenDbImpl(params);
}

/**
 * `InvitationEmailContext` に基づき HTML メールを送信する。
 * Send the invitation HTML email using a pre-built context.
 */
export async function deliverInvitationEmail(
  context: InvitationEmailContext,
): Promise<SendInvitationResult> {
  const { memberEmail, role, inviteUrl, noteTitle, inviterName, locale } = context;

  try {
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
 * 招待トークンを生成し、メールを送信する
 * Generate an invitation token and send the email
 *
 * @param params - 送信パラメータ / Sending parameters
 * @returns 送信結果 / Sending result
 */
export async function sendInvitation(params: SendInvitationParams): Promise<SendInvitationResult> {
  const built = await upsertInvitationTokenInDb(params);
  if (!built.ok) {
    return { sent: false, error: built.error };
  }
  return deliverInvitationEmail(built.context);
}
