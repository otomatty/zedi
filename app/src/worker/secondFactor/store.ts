/**
 * D1 access for the second factor. Each check-and-change is a single statement, so two
 * requests racing for the same code or enrollment cannot both win.
 * 2 段階目の D1 操作。確認と更新を 1 文で行い、同じコードや登録を同時に取り合っても片方しか通らない。
 */

/** Attempts allowed per user within one window before the second step is refused. */
export const MAX_ATTEMPTS = 5;
/** Length of the attempt window. */
export const ATTEMPT_WINDOW_MS = 15 * 60_000;

/** A stored authenticator app; unconfirmed until the user entered its first code. */
export interface TotpFactor {
  sealedSecret: string;
  confirmed: boolean;
}

/** The user's authenticator app (pending or confirmed), if any. */
export async function findTotp(db: D1Database, userId: string): Promise<TotpFactor | null> {
  const row = await db
    .prepare("SELECT secret, confirmed_at FROM totp_factors WHERE user_id = ?1")
    .bind(userId)
    .first<{ secret: string; confirmed_at: number | null }>();
  return row ? { sealedSecret: row.secret, confirmed: row.confirmed_at !== null } : null;
}

/** How many unused recovery codes the user has. */
export async function countRecoveryCodes(db: D1Database, userId: string): Promise<number> {
  const row = await db
    .prepare("SELECT COUNT(*) AS n FROM recovery_codes WHERE user_id = ?1 AND used_at IS NULL")
    .bind(userId)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

/**
 * Stores a new pending secret, replacing an earlier pending one. Returns false when the user
 * already has a confirmed app, which is left untouched.
 * 未確定の秘密鍵を保存する（前の未確定分は置き換える）。確定済みの認証アプリがあれば false。
 */
export async function savePendingTotp(
  db: D1Database,
  userId: string,
  sealedSecret: string,
  now: number,
): Promise<boolean> {
  const result = await db
    .prepare(
      `INSERT INTO totp_factors (user_id, secret, created_at) VALUES (?1, ?2, ?3)
       ON CONFLICT (user_id) DO UPDATE SET secret = excluded.secret, created_at = excluded.created_at
       WHERE totp_factors.confirmed_at IS NULL`,
    )
    .bind(userId, sealedSecret, now)
    .run();
  return result.meta.changes > 0;
}

/**
 * Confirms the pending secret the code was checked against. Fails when it was confirmed or
 * replaced in the meantime.
 * 確かめた未確定の秘密鍵を確定する。その間に確定・置き換えされていたら失敗。
 */
export async function confirmTotp(
  db: D1Database,
  userId: string,
  sealedSecret: string,
  step: number,
  now: number,
): Promise<boolean> {
  const result = await db
    .prepare(
      `UPDATE totp_factors SET confirmed_at = ?4, last_used_step = ?3
       WHERE user_id = ?1 AND secret = ?2 AND confirmed_at IS NULL`,
    )
    .bind(userId, sealedSecret, step, now)
    .run();
  return result.meta.changes > 0;
}

/** Records `step` as used; false when it (or a later step) was used already. */
export async function useTotpStep(db: D1Database, userId: string, step: number): Promise<boolean> {
  const result = await db
    .prepare(
      `UPDATE totp_factors SET last_used_step = ?2
       WHERE user_id = ?1 AND confirmed_at IS NOT NULL AND (last_used_step IS NULL OR last_used_step < ?2)`,
    )
    .bind(userId, step)
    .run();
  return result.meta.changes > 0;
}

/** Replaces the user's recovery codes with `hashes`. */
export async function replaceRecoveryCodes(
  db: D1Database,
  userId: string,
  hashes: string[],
  now: number,
): Promise<void> {
  await db.batch([
    db.prepare("DELETE FROM recovery_codes WHERE user_id = ?1").bind(userId),
    ...hashes.map((hash) =>
      db
        .prepare("INSERT INTO recovery_codes (user_id, code_hash, created_at) VALUES (?1, ?2, ?3)")
        .bind(userId, hash, now),
    ),
  ]);
}

/** Uses up a recovery code; false when it does not exist or was used. */
export async function useRecoveryCode(
  db: D1Database,
  userId: string,
  hash: string,
  now: number,
): Promise<boolean> {
  const result = await db
    .prepare(
      "UPDATE recovery_codes SET used_at = ?3 WHERE user_id = ?1 AND code_hash = ?2 AND used_at IS NULL",
    )
    .bind(userId, hash, now)
    .run();
  return result.meta.changes > 0;
}

/**
 * Counts an attempt at the second step before the code is checked, so parallel requests
 * cannot slip past the limit. Returns how long to wait when the limit is reached.
 * コードを確かめる前に試行を数える（同時のリクエストでも上限を超えない）。上限なら待つ時間を返す。
 */
export async function reserveAttempt(
  db: D1Database,
  userId: string,
  now: number,
): Promise<{ allowed: true } | { allowed: false; retryAfterMs: number }> {
  const row = await db
    .prepare(
      `INSERT INTO second_factor_attempts (user_id, attempts, window_started_at) VALUES (?1, 1, ?2)
       ON CONFLICT (user_id) DO UPDATE SET
         attempts = CASE WHEN window_started_at <= ?2 - ?3 THEN 1 ELSE attempts + 1 END,
         window_started_at = CASE WHEN window_started_at <= ?2 - ?3 THEN ?2 ELSE window_started_at END
       RETURNING attempts, window_started_at`,
    )
    .bind(userId, now, ATTEMPT_WINDOW_MS)
    .first<{ attempts: number; window_started_at: number }>();
  if (!row || row.attempts <= MAX_ATTEMPTS) return { allowed: true };
  return { allowed: false, retryAfterMs: row.window_started_at + ATTEMPT_WINDOW_MS - now };
}

/** Clears the attempt count after a successful second step. */
export async function clearAttempts(db: D1Database, userId: string): Promise<void> {
  await db.prepare("DELETE FROM second_factor_attempts WHERE user_id = ?1").bind(userId).run();
}

/** Marks the session as having passed the second step now; false when it no longer exists. */
export async function markSessionVerified(
  db: D1Database,
  sessionId: string,
  now: number,
): Promise<boolean> {
  const result = await db
    .prepare("UPDATE session SET second_factor_at = ?2, updated_at = ?2 WHERE id = ?1")
    .bind(sessionId, now)
    .run();
  return result.meta.changes > 0;
}

/** Deletes a session (an unverified one that ran out of time). */
export async function deleteSession(db: D1Database, sessionId: string): Promise<void> {
  await db.prepare("DELETE FROM session WHERE id = ?1").bind(sessionId).run();
}
