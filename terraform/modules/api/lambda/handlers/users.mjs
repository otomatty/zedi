/**
 * ユーザー API: POST /api/users/upsert, GET /api/users/:id
 * Cognito の sub/email から users を upsert
 */

import * as res from "../responses.mjs";
import { execute } from "../lib/db.mjs";

const UPSERT_SQL = `
INSERT INTO users (cognito_sub, email, display_name, avatar_url)
VALUES (:cognito_sub, :email, :display_name, :avatar_url)
ON CONFLICT (cognito_sub) DO UPDATE SET
  email = EXCLUDED.email,
  display_name = COALESCE(NULLIF(TRIM(EXCLUDED.display_name), ''), users.display_name),
  avatar_url = COALESCE(NULLIF(TRIM(EXCLUDED.avatar_url), ''), users.avatar_url),
  updated_at = NOW()
RETURNING id, cognito_sub, email, display_name, avatar_url, created_at, updated_at
`;

const GET_BY_ID_SQL = `
SELECT id, cognito_sub, email, display_name, avatar_url, created_at, updated_at
FROM users WHERE id = :id
`;

/**
 * POST /api/users/upsert — リクエストボディ: { display_name?, avatar_url? }. sub/email は JWT claims から。
 * @param {{ sub: string; email?: string }} claims
 * @param {{ display_name?: string; avatar_url?: string } | null} body
 */
export async function upsert(claims, body = {}) {
  const cognito_sub = claims?.sub;
  const email =
    body?.email ??
    claims?.email ??
    claims?.["cognito:username"] ??
    "";
  if (!cognito_sub || !email) {
    return res.badRequest("sub and email are required");
  }

  const rows = await execute(UPSERT_SQL, {
    cognito_sub,
    email: String(email).trim(),
    display_name: body?.display_name ?? null,
    avatar_url: body?.avatar_url ?? null,
  });
  const row = rows[0];
  if (!row) return res.error("Upsert failed", 500, "DB_ERROR");
  return res.success(rowToUser(row));
}

/**
 * GET /api/users/:id
 */
export async function getById(id) {
  if (!id) return res.badRequest("User id is required");
  const rows = await execute(GET_BY_ID_SQL, { id });
  const row = rows[0];
  if (!row) return res.notFound("User not found");
  return res.success(rowToUser(row));
}

function rowToUser(row) {
  return {
    id: row.id,
    cognito_sub: row.cognito_sub,
    email: row.email,
    display_name: row.display_name ?? null,
    avatar_url: row.avatar_url ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}
