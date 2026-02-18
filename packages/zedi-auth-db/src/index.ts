/**
 * Cognito sub → users.id resolution for RDS Data API.
 * Contract: DB user identifier for FK must be users.id; this module resolves cognito_sub to that id.
 */

/** RDS Data API–style executor: (sql, params) => rows */
export type ExecuteFn = (
  sql: string,
  params: Record<string, unknown>
) => Promise<Array<Record<string, unknown>>>;

export const RESOLVE_USER_ID_SQL =
  "SELECT id FROM users WHERE cognito_sub = :cognito_sub";

export const RESOLVE_USER_SQL =
  "SELECT id, email FROM users WHERE cognito_sub = :cognito_sub";

/**
 * Resolve Cognito sub to users.id (UUID). Returns null if no row.
 */
export async function resolveUserId(
  cognitoSub: string | undefined,
  execute: ExecuteFn
): Promise<string | null> {
  if (!cognitoSub) return null;
  const rows = await execute(RESOLVE_USER_ID_SQL, { cognito_sub: cognitoSub });
  const id = rows[0]?.id;
  return typeof id === "string" ? id : null;
}

/**
 * Resolve Cognito sub to users row { id, email }. Returns null if no row.
 */
export async function resolveUser(
  cognitoSub: string | undefined,
  execute: ExecuteFn
): Promise<{ id: string; email: string } | null> {
  if (!cognitoSub) return null;
  const rows = await execute(RESOLVE_USER_SQL, { cognito_sub: cognitoSub });
  const row = rows[0];
  if (!row || typeof row.id !== "string") return null;
  const email = row.email;
  return {
    id: row.id,
    email: typeof email === "string" ? email : "",
  };
}
