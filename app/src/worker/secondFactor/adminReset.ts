/**
 * SQL for the admin's recovery of a user who lost every second factor
 * (docs/secondFactorRecovery.md, run through scripts/resetSecondFactor.mjs). Not used by the
 * Worker itself. Statements name the user by address, since that is what the admin is given.
 * すべての確認方法を失った人を管理者が復旧するための SQL。Worker 自身は使わない。
 */

/** A plain address: RFC 5322 atext before the `@`, a dotted host name after it. */
const ADDRESS = /^[a-z0-9!#$%&'*+/=?^_`{|}~.-]+@[a-z0-9-]+(\.[a-z0-9-]+)+$/;

/** The address as stored (lowercase, no spaces around it); throws for anything else. */
export function normalizeEmail(email: string): string {
  const normalized = email.trim().toLowerCase();
  if (!ADDRESS.test(normalized))
    throw new Error(`not a plain email address: ${JSON.stringify(email)}`);
  return normalized;
}

/** The address as an SQL string literal (SQLite only ends a string at an undoubled quote). */
const literal = (email: string) => `'${normalizeEmail(email).replaceAll("'", "''")}'`;

/**
 * One row about the account, or none when no user has the address: its id, when it was
 * created, how many passkeys, whether an app, how many unused recovery codes and sessions.
 */
export function inspectSql(email: string): string {
  return [
    "SELECT u.id, u.email, u.created_at,",
    "(SELECT COUNT(*) FROM passkeys p WHERE p.user_id = u.id) AS passkeys,",
    "(SELECT COUNT(*) FROM totp_factors t WHERE t.user_id = u.id AND t.confirmed_at IS NOT NULL) AS authenticator_app,",
    "(SELECT COUNT(*) FROM recovery_codes r WHERE r.user_id = u.id AND r.used_at IS NULL) AS recovery_codes_left,",
    "(SELECT COUNT(*) FROM session s WHERE s.user_id = u.id) AS sessions",
    `FROM user u WHERE u.email = ${literal(email)}`,
  ].join(" ");
}

/**
 * Deletes the user's passkeys, authenticator app (confirmed or pending), recovery codes and
 * attempt count, then ends every session (with its WebAuthn challenges). The account, its
 * Google link and its notes stay. With no method left, the next Google sign-in registers a
 * new first one and shows new recovery codes. Run them together, in one transaction.
 * 確認方法・復旧用コード・試行の回数を消し、すべてのセッションを終える。アカウントとノートは残す。
 */
export function resetStatements(email: string): string[] {
  const user = `(SELECT id FROM user WHERE email = ${literal(email)})`;
  return [
    `DELETE FROM webauthn_challenges WHERE session_id IN (SELECT id FROM session WHERE user_id = ${user});`,
    `DELETE FROM passkeys WHERE user_id = ${user};`,
    `DELETE FROM totp_factors WHERE user_id = ${user};`,
    `DELETE FROM recovery_codes WHERE user_id = ${user};`,
    `DELETE FROM second_factor_attempts WHERE user_id = ${user};`,
    `DELETE FROM session WHERE user_id = ${user};`,
  ];
}
