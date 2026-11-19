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

/**
 * Statements that store a first enrollment's recovery codes under `batch`, only while the user
 * has no factor. Other sessions' pending batches are left alone; confirming an enrollment keeps
 * only its own batch (see `confirmTotp` and `savePasskey`).
 */
function issueCodeStatements(
  db: D1Database,
  userId: string,
  codeHashes: string[],
  batch: string,
  now: number,
) {
  return codeHashes.map((hash) =>
    db
      .prepare(
        `INSERT INTO recovery_codes (user_id, code_hash, created_at, batch)
         SELECT ?1, ?2, ?3, ?4 WHERE ${NOT_ENROLLED}`,
      )
      .bind(userId, hash, now, batch),
  );
}

/**
 * Stores the recovery codes handed out with a first passkey's registration options; like the
 * authenticator app's, they only work once that registration is confirmed. Does nothing once the
 * user has a factor.
 * 最初のパスキーの登録で渡す復旧用コードを保存する。確認方法がすでにあれば何もしない。
 */
export async function issueRecoveryCodes(
  db: D1Database,
  userId: string,
  codeHashes: string[],
  batch: string,
  now: number,
): Promise<void> {
  await db.batch(issueCodeStatements(db, userId, codeHashes, batch, now));
}

/**
 * Stores a new pending secret, replacing an earlier pending enrollment, and (for a user with no
 * factor yet) its recovery codes under `batch`. Returns false, and changes nothing, when the user
 * already has a confirmed app. The codes are handed out with the secret so a lost confirmation
 * response loses nothing; they only work once this enrollment is confirmed.
 * 未確定の秘密鍵と（最初の確認方法なら）復旧用コードを保存する。確定済みのアプリがあれば何も変えず false。
 */
export async function savePendingEnrollment(
  db: D1Database,
  userId: string,
  sealedSecret: string,
  codeHashes: string[],
  batch: string | null,
  now: number,
): Promise<boolean> {
  const [saved] = await db.batch([
    db
      .prepare(
        `INSERT INTO totp_factors (user_id, secret, created_at, recovery_batch) VALUES (?1, ?2, ?3, ?4)
         ON CONFLICT (user_id) DO UPDATE SET secret = excluded.secret,
           created_at = excluded.created_at, recovery_batch = excluded.recovery_batch
         WHERE totp_factors.confirmed_at IS NULL`,
      )
      .bind(userId, sealedSecret, now, batch),
    ...(batch ? issueCodeStatements(db, userId, codeHashes, batch, now) : []),
  ]);
  return (saved?.meta.changes ?? 0) > 0;
}

/**
 * Confirms the pending secret the code was checked against. Fails when it was confirmed or
 * replaced in the meantime. As the first factor it also fails when a passkey was registered
 * meanwhile (checked in the same statement), and keeps only this enrollment's recovery codes.
 * 確かめた未確定の秘密鍵を確定する。最初の確認方法としてなら、その間にパスキーが登録されていれば失敗し、
 * この登録で渡した復旧用コードだけを残す。
 */
export async function confirmTotp(
  db: D1Database,
  userId: string,
  sealedSecret: string,
  step: number,
  now: number,
  firstFactor: boolean,
): Promise<boolean> {
  const confirm = db
    .prepare(
      `UPDATE totp_factors SET confirmed_at = ?4, last_used_step = ?3
       WHERE user_id = ?1 AND secret = ?2 AND confirmed_at IS NULL
         ${firstFactor ? "AND NOT EXISTS (SELECT 1 FROM passkeys WHERE user_id = ?1)" : ""}`,
    )
    .bind(userId, sealedSecret, step, now);
  if (!firstFactor) return (await confirm.run()).meta.changes > 0;
  const [confirmed] = await db.batch([
    confirm,
    db
      .prepare(
        `DELETE FROM recovery_codes WHERE user_id = ?1
           AND batch IS NOT (SELECT recovery_batch FROM totp_factors WHERE user_id = ?1)
           AND EXISTS (SELECT 1 FROM totp_factors
                       WHERE user_id = ?1 AND secret = ?2 AND confirmed_at = ?3)`,
      )
      .bind(userId, sealedSecret, now),
  ]);
  return (confirmed?.meta.changes ?? 0) > 0;
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

/**
 * Stores a registered passkey; false when the credential ID is already registered. As the first
 * factor (`firstFactor`), it is stored only if the user still has no factor, checked in the
 * same statement so a confirmation racing in another session cannot let Google alone add one,
 * and only the recovery codes issued with this registration (`batch`) are kept.
 * 登録したパスキーを保存する。最初の確認方法としてなら、まだ確認方法がないことを同じ文で確かめ、
 * この登録で渡した復旧用コードだけを残す。
 */
export async function savePasskey(
  db: D1Database,
  userId: string,
  passkey: StoredPasskey & { name: string },
  now: number,
  firstFactor: { batch: string | null } | null,
): Promise<boolean> {
  const insert = db
    .prepare(
      `INSERT INTO passkeys (id, user_id, public_key, counter, transports, name, created_at)
       SELECT ?2, ?1, ?3, ?4, ?5, ?6, ?7 WHERE ${firstFactor ? NOT_ENROLLED : "1"}
       ON CONFLICT (id) DO NOTHING`,
    )
    .bind(
      userId,
      passkey.id,
      passkey.publicKey,
      passkey.counter,
      JSON.stringify(passkey.transports),
      passkey.name,
      now,
    );
  if (!firstFactor) return (await insert.run()).meta.changes > 0;
  const [inserted] = await db.batch([
    insert,
    db
      .prepare(
        `DELETE FROM recovery_codes WHERE user_id = ?1 AND batch IS NOT ?2
           AND EXISTS (SELECT 1 FROM passkeys WHERE user_id = ?1 AND id = ?3 AND created_at = ?4)`,
      )
      .bind(userId, firstFactor.batch, passkey.id, now),
  ]);
  return (inserted?.meta.changes ?? 0) > 0;
}

/** A passkey as the settings page lists it. */
export interface PasskeySummary {
  id: string;
  name: string;
  createdAt: number;
  lastUsedAt: number | null;
}

/** The user's passkeys for the settings page, oldest first. */
export async function describePasskeys(db: D1Database, userId: string): Promise<PasskeySummary[]> {
  const { results } = await db
    .prepare(
      `SELECT id, name, created_at, last_used_at FROM passkeys WHERE user_id = ?1
       ORDER BY created_at, id`,
    )
    .bind(userId)
    .all<{ id: string; name: string; created_at: number; last_used_at: number | null }>();
  return results.map((row) => ({
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
  }));
}

/**
 * Removes one of the user's passkeys, only if another method is left (another passkey or a
 * confirmed app). The condition is part of the statement, so two removals racing cannot leave
 * the user with none.
 * パスキーを消す。ほかの確認方法が残るときだけで、その条件は同じ文の中で確かめる。
 */
export async function deletePasskey(db: D1Database, userId: string, id: string): Promise<boolean> {
  const result = await db
    .prepare(
      `DELETE FROM passkeys WHERE user_id = ?1 AND id = ?2
         AND (EXISTS (SELECT 1 FROM passkeys WHERE user_id = ?1 AND id <> ?2)
              OR EXISTS (SELECT 1 FROM totp_factors WHERE user_id = ?1 AND confirmed_at IS NOT NULL))`,
    )
    .bind(userId, id)
    .run();
  return result.meta.changes > 0;
}

/** Removes the user's confirmed app, only if a passkey is left (checked in the statement). */
export async function deleteTotp(db: D1Database, userId: string): Promise<boolean> {
  const result = await db
    .prepare(
      `DELETE FROM totp_factors WHERE user_id = ?1 AND confirmed_at IS NOT NULL
         AND EXISTS (SELECT 1 FROM passkeys WHERE user_id = ?1)`,
    )
    .bind(userId)
    .run();
  return result.meta.changes > 0;
}

/**
 * Switches the user to the recovery codes of `batch`, in one transaction: every code of another
 * batch goes (used or not) and the new ones are added. Running it again for the same batch
 * changes nothing, so a retried confirmation keeps a code already used from the new set used.
 * 復旧用コードを `batch` のものに切り替える。同じ batch でもう一度実行しても何も変わらない。
 */
export async function replaceRecoveryCodes(
  db: D1Database,
  userId: string,
  codeHashes: string[],
  batch: string,
  now: number,
): Promise<void> {
  await db.batch([
    db
      .prepare("DELETE FROM recovery_codes WHERE user_id = ?1 AND batch IS NOT ?2")
      .bind(userId, batch),
    ...codeHashes.map((hash) =>
      db
        .prepare(
          `INSERT OR IGNORE INTO recovery_codes (user_id, code_hash, created_at, batch)
           VALUES (?1, ?2, ?3, ?4)`,
        )
        .bind(userId, hash, now, batch),
    ),
  ]);
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

/**
 * Stores the challenge the session must answer for `purpose`, replacing an earlier one, with the
 * recovery codes' batch when it registers a first passkey.
 */
export async function saveChallenge(
  db: D1Database,
  sessionId: string,
  purpose: "register" | "authenticate",
  challenge: string,
  now: number,
  recoveryBatch: string | null = null,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO webauthn_challenges (session_id, purpose, challenge, recovery_batch, expires_at)
       VALUES (?1, ?2, ?3, ?4, ?5)
       ON CONFLICT (session_id, purpose) DO UPDATE SET challenge = excluded.challenge,
         recovery_batch = excluded.recovery_batch, expires_at = excluded.expires_at`,
    )
    .bind(sessionId, purpose, challenge, recoveryBatch, now + CHALLENGE_TTL_MS)
    .run();
}

/** Takes (deletes and returns) the session's unexpired challenge for `purpose`. */
export async function takeChallenge(
  db: D1Database,
  sessionId: string,
  purpose: "register" | "authenticate",
  now: number,
): Promise<{ challenge: string; recoveryBatch: string | null } | null> {
  const row = await db
    .prepare(
      `DELETE FROM webauthn_challenges WHERE session_id = ?1 AND purpose = ?2
       RETURNING challenge, recovery_batch, expires_at`,
    )
    .bind(sessionId, purpose)
    .first<{ challenge: string; recovery_batch: string | null; expires_at: number }>();
  return row && row.expires_at > now
    ? { challenge: row.challenge, recoveryBatch: row.recovery_batch }
    : null;
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
