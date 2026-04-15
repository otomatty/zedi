/**
 * ユーザー削除（論理削除）のヘルパー関数群。
 * Helper functions for user deletion (soft-delete / logical deletion).
 *
 * - `getUserImpact` は削除前の影響範囲を取得する。
 * - `anonymizeUser` は個人情報を匿名化し `status='deleted'` に設定する。
 *
 * `getUserImpact` fetches impact information before deletion.
 * `anonymizeUser` anonymizes personal data and sets `status='deleted'`.
 */
import { eq, sql, desc, and } from "drizzle-orm";
import { users, session, account } from "../schema/users.js";
import { notes } from "../schema/notes.js";
import { subscriptions } from "../schema/subscriptions.js";
import { aiUsageLogs } from "../schema/aiModels.js";
import type { Database } from "../types/index.js";

/**
 * 削除前の影響範囲情報。
 * Impact information shown to the admin before user deletion.
 */
export interface UserImpact {
  /** 所有ノート数 / Number of notes owned by the user */
  notesCount: number;
  /** アクティブセッション数 / Number of active sessions */
  sessionsCount: number;
  /** アクティブなサブスクリプションがあるか / Whether user has an active subscription */
  activeSubscription: boolean;
  /** 最後の AI 使用日時（ISO 8601、なければ null）/ Last AI usage timestamp or null */
  lastAiUsageAt: string | null;
}

/**
 * 対象ユーザーの削除影響範囲を取得する。
 * Fetches the impact of deleting a user (owned notes, sessions, subscription, AI usage).
 *
 * @param db - Drizzle database client
 * @param userId - Target user ID
 * @returns Impact information
 */
export async function getUserImpact(db: Database, userId: string): Promise<UserImpact> {
  const [notesResult, sessionsResult, subResult, aiResult] = await Promise.all([
    db
      .select({ count: sql<number>`cast(count(*) as integer)` })
      .from(notes)
      .where(and(eq(notes.ownerId, userId), eq(notes.isDeleted, false))),
    db
      .select({ count: sql<number>`cast(count(*) as integer)` })
      .from(session)
      .where(eq(session.userId, userId)),
    db
      .select({ status: subscriptions.status })
      .from(subscriptions)
      .where(eq(subscriptions.userId, userId))
      .limit(1),
    db
      .select({ createdAt: aiUsageLogs.createdAt })
      .from(aiUsageLogs)
      .where(eq(aiUsageLogs.userId, userId))
      .orderBy(desc(aiUsageLogs.createdAt))
      .limit(1),
  ]);

  return {
    notesCount: notesResult[0]?.count ?? 0,
    sessionsCount: sessionsResult[0]?.count ?? 0,
    activeSubscription: subResult[0]?.status === "active",
    lastAiUsageAt: aiResult[0]?.createdAt?.toISOString() ?? null,
  };
}

/**
 * ユーザーの個人情報を匿名化し `status='deleted'` に設定する。
 * セッションと OAuth 連携情報も削除する。
 *
 * Anonymizes user personal data and sets `status='deleted'`.
 * Also deletes all sessions and OAuth account records.
 *
 * @param tx - Drizzle transaction client
 * @param userId - Target user ID
 * @returns Anonymized user row (for the API response) and a redacted before-snapshot for audit logs
 */
export async function anonymizeUser(
  tx: Database,
  userId: string,
): Promise<{
  updated: {
    id: string;
    name: string;
    email: string;
    role: string;
    status: string;
    suspendedAt: Date | null;
    suspendedReason: string | null;
    suspendedBy: string | null;
    createdAt: Date;
  };
  before: {
    status: string;
    piiRedacted: true;
  };
}> {
  // 変更前ステータスを取得する。監査ログには PII を残さない。
  // Capture the pre-delete status only; audit logs must not retain recoverable PII.
  const [target] = await tx
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      image: users.image,
      status: users.status,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!target) {
    throw new Error(`User ${userId} not found`);
  }

  const before = {
    status: target.status,
    piiRedacted: true as const,
  };

  const now = new Date();
  const anonymizedEmail = `deleted-${userId}@example.invalid`;
  const anonymizedName = "Deleted User";

  // 1. 全セッション削除 / Delete all sessions
  await tx.delete(session).where(eq(session.userId, userId));

  // 2. OAuth 連携情報を削除 / Delete OAuth account records
  await tx.delete(account).where(eq(account.userId, userId));

  // 3. 個人情報を匿名化し status='deleted' に設定
  //    Anonymize personal data and set status to 'deleted'
  const [updated] = await tx
    .update(users)
    .set({
      name: anonymizedName,
      email: anonymizedEmail,
      image: null,
      status: "deleted",
      suspendedAt: null,
      suspendedReason: null,
      suspendedBy: null,
      updatedAt: now,
    })
    .where(eq(users.id, userId))
    .returning({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      status: users.status,
      suspendedAt: users.suspendedAt,
      suspendedReason: users.suspendedReason,
      suspendedBy: users.suspendedBy,
      createdAt: users.createdAt,
    });

  if (!updated) {
    throw new Error(`Failed to anonymize user ${userId}`);
  }

  return { updated, before };
}
