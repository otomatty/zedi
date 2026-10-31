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

/** User ?1 has a confirmed authenticator app or a passkey. */
const ENROLLED = `(EXISTS (SELECT 1 FROM totp_factors WHERE user_id = ?1 AND confirmed_at IS NOT NULL)
  OR EXISTS (SELECT 1 FROM passkeys WHERE user_id = ?1))`;
/** User ?1 has no second factor yet (guards writes only the first enrollment may make). */
const NOT_ENROLLED = `NOT ${ENROLLED}`;

/** Whether the user has any second factor: a confirmed authenticator app or a passkey. */
export async function hasFactor(db: D1Database, userId: string): Promise<boolean> {
  const row = await db
    .prepare(`SELECT ${ENROLLED} AS enrolled`)
    .bind(userId)
    .first<{ enrolled: number }>();
  return row?.enrolled === 1;
}

/** Statements that replace the user's recovery codes, only while the user has no factor. */
function issueCodeStatements(db: D1Database, userId: string, codeHashes: string[], now: number) {
  return [
    db.prepare(`DELETE FROM recovery_codes WHERE user_id = ?1 AND ${NOT_ENROLLED}`).bind(userId),
    ...codeHashes.map((hash) =>
      db
        .prepare(
          `INSERT INTO recovery_codes (user_id, code_hash, created_at)
           SELECT ?1, ?2, ?3 WHERE ${NOT_ENROLLED}`,
        )
        .bind(userId, hash, now),
    ),
  ];
}

/**
 * Stores the recovery codes handed out with a first passkey's registration options; like the
 * authenticator app's, they only work once the passkey is registered. Does nothing once the
 * user has a factor.
 * 最初のパスキーの登録で渡す復旧用コードを保存する。確認方法がすでにあれば何もしない。
 */
export async function issueRecoveryCodes(
  db: D1Database,
  userId: string,
  codeHashes: string[],
  now: number,
): Promise<void> {
  await db.batch(issueCodeStatements(db, userId, codeHashes, now));
}

/**
 * Stores a new pending secret, replacing an earlier pending enrollment, and (for a user with no
 * factor yet) its recovery codes. Returns false, and changes nothing, when the user already has
 * a confirmed app. The codes are handed out with the secret so a lost confirmation response
 * loses nothing; they only work once a factor is confirmed.
 * 未確定の秘密鍵と（最初の確認方法なら）復旧用コードを保存する。確定済みのアプリがあれば何も変えず false。
 */
export async function savePendingEnrollment(
  db: D1Database,
  userId: string,
  sealedSecret: string,
  codeHashes: string[],
  now: number,
): Promise<boolean> {
  const [saved] = await db.batch([
    db
      .prepare(
        `INSERT INTO totp_factors (user_id, secret, created_at) VALUES (?1, ?2, ?3)
         ON CONFLICT (user_id) DO UPDATE SET secret = excluded.secret, created_at = excluded.created_at
         WHERE totp_factors.confirmed_at IS NULL`,
      )
      .bind(userId, sealedSecret, now),
    ...(codeHashes.length > 0 ? issueCodeStatements(db, userId, codeHashes, now) : []),
  ]);
  return (saved?.meta.changes ?? 0) > 0;
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

/**
 * Uses up a recovery code; false when it does not exist, was used, or belongs to an enrollment
 * that was never finished (no confirmed app and no passkey).
 */
export async function useRecoveryCode(
  db: D1Database,
  userId: string,
  hash: string,
  now: number,
): Promise<boolean> {
  const result = await db
    .prepare(
      `UPDATE recovery_codes SET used_at = ?3
       WHERE user_id = ?1 AND code_hash = ?2 AND used_at IS NULL AND ${ENROLLED}`,
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

/** When the session last passed the second step (ms), read from D1 rather than the cookie cache. */
export async function secondFactorAt(db: D1Database, sessionId: string): Promise<number | null> {
  const row = await db
    .prepare("SELECT second_factor_at FROM session WHERE id = ?1")
    .bind(sessionId)
    .first<{ second_factor_at: number | null }>();
  return row?.second_factor_at ?? null;
}

/** A stored passkey, in the shape SimpleWebAuthn verifies against. */
export interface StoredPasskey {
  id: string;
  publicKey: string;
  counter: number;
  transports: string[];
}

/** The user's passkeys. */
export async function listPasskeys(db: D1Database, userId: string): Promise<StoredPasskey[]> {
  const { results } = await db
    .prepare("SELECT id, public_key, counter, transports FROM passkeys WHERE user_id = ?1")
    .bind(userId)
    .all<{ id: string; public_key: string; counter: number; transports: string | null }>();
  return results.map((row) => ({
    id: row.id,
    publicKey: row.public_key,
    counter: row.counter,
    transports: row.transports ? (JSON.parse(row.transports) as string[]) : [],
  }));
}

/** Stores a registered passkey; false when the credential ID is already registered. */
export async function savePasskey(
  db: D1Database,
  userId: string,
  passkey: StoredPasskey & { name: string },
  now: number,
): Promise<boolean> {
  const result = await db
    .prepare(
      `INSERT INTO passkeys (id, user_id, public_key, counter, transports, name, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7) ON CONFLICT (id) DO NOTHING`,
    )
    .bind(
      passkey.id,
      userId,
      passkey.publicKey,
      passkey.counter,
      JSON.stringify(passkey.transports),
      passkey.name,
      now,
    )
    .run();
  return result.meta.changes > 0;
}

/**
 * Records a sign-in with a passkey: the new signature counter, only if the stored one is still
 * the one the assertion was checked against (two sign-ins racing cannot both pass).
 * パスキーでの確認を記録する。確かめたときのカウンターのままのときだけ更新する。
 */
export async function usePasskey(
  db: D1Database,
  userId: string,
  id: string,
  checkedCounter: number,
  newCounter: number,
  now: number,
): Promise<boolean> {
  const result = await db
    .prepare(
      `UPDATE passkeys SET counter = ?4, last_used_at = ?5
       WHERE id = ?2 AND user_id = ?1 AND counter = ?3`,
    )
    .bind(userId, id, checkedCounter, newCounter, now)
    .run();
  return result.meta.changes > 0;
}

/** How long a WebAuthn challenge stays valid. */
export const CHALLENGE_TTL_MS = 5 * 60_000;

/** Stores the challenge the session must answer for `purpose`, replacing an earlier one. */
export async function saveChallenge(
  db: D1Database,
  sessionId: string,
  purpose: "register" | "authenticate",
  challenge: string,
  now: number,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO webauthn_challenges (session_id, purpose, challenge, expires_at)
       VALUES (?1, ?2, ?3, ?4)
       ON CONFLICT (session_id, purpose) DO UPDATE SET
         challenge = excluded.challenge, expires_at = excluded.expires_at`,
    )
    .bind(sessionId, purpose, challenge, now + CHALLENGE_TTL_MS)
    .run();
}

/** Takes (deletes and returns) the session's unexpired challenge for `purpose`. */
export async function takeChallenge(
  db: D1Database,
  sessionId: string,
  purpose: "register" | "authenticate",
  now: number,
): Promise<string | null> {
  const row = await db
    .prepare(
      `DELETE FROM webauthn_challenges WHERE session_id = ?1 AND purpose = ?2
       RETURNING challenge, expires_at`,
    )
    .bind(sessionId, purpose)
    .first<{ challenge: string; expires_at: number }>();
  return row && row.expires_at > now ? row.challenge : null;
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
