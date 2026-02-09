/**
 * 検索 API: GET /api/search?q=&scope=shared
 * C1-7: 共有ノートの全文検索（pg_bigm）。自分がアクセス可能なノートに含まれるページを title / content_text で検索。
 */

import * as res from "../responses.mjs";
import { execute } from "../lib/db.mjs";

const GET_USER_SQL = `
SELECT id, email FROM users WHERE cognito_sub = :cognito_sub
`;

/**
 * 自分がアクセス可能なノートに含まれるページのうち、q が title または content_text に含まれるものを取得。
 * pg_bigm (GIN gin_bigm_ops) により LIKE 検索がインデックスで高速化される。
 */
const SEARCH_SHARED_SQL = `
SELECT DISTINCT p.id, p.owner_id, p.title, p.content_preview, p.thumbnail_url, p.source_url, p.updated_at
FROM note_pages np
JOIN notes n ON n.id = np.note_id AND n.is_deleted = FALSE
LEFT JOIN note_members nm ON nm.note_id = n.id AND nm.member_email = :user_email AND nm.is_deleted = FALSE
JOIN pages p ON p.id = np.page_id AND p.is_deleted = FALSE
LEFT JOIN page_contents pc ON pc.page_id = p.id
WHERE np.is_deleted = FALSE
  AND (n.owner_id = :owner_id OR nm.note_id IS NOT NULL)
  AND (p.title LIKE :q_like ESCAPE '\\' OR pc.content_text LIKE :q_like ESCAPE '\\')
ORDER BY p.updated_at DESC
LIMIT 100
`;

/**
 * LIKE の特殊文字 % _ \ をエスケープする（ESCAPE '\' 用）
 * @param {string} s
 * @returns {string}
 */
function escapeLike(s) {
  return String(s)
    .replace(/\\/g, "\\\\")
    .replace(/%/g, "\\%")
    .replace(/_/g, "\\_");
}

/**
 * 現在ユーザーの owner_id と email を取得
 * @param {{ sub: string }} claims
 * @returns {Promise<{ ownerId: string; email: string }|null>}
 */
async function getCurrentUser(claims) {
  const sub = claims?.sub;
  if (!sub) return null;
  const rows = await execute(GET_USER_SQL, { cognito_sub: sub });
  const r = rows[0];
  if (!r?.id || !r?.email) return null;
  return { ownerId: r.id, email: String(r.email).trim().toLowerCase() };
}

/**
 * GET /api/search?q={query}&scope=shared
 * scope=shared の場合、自分がアクセス可能なノート（owner または member）に含まれるページを
 * title および page_contents.content_text に対して q で LIKE 検索（pg_bigm インデックス利用）。
 */
export async function searchShared(claims, queryParams = {}) {
  const scope = (queryParams?.scope ?? "").trim().toLowerCase();
  if (scope !== "shared") {
    return res.badRequest("scope=shared is required");
  }

  const q = (queryParams?.q ?? "").trim();
  if (!q) {
    return res.success({ results: [] });
  }

  const user = await getCurrentUser(claims);
  if (!user) return res.unauthorized("User not found");

  const qLike = "%" + escapeLike(q) + "%";
  const rows = await execute(SEARCH_SHARED_SQL, {
    owner_id: user.ownerId,
    user_email: user.email,
    q_like: qLike,
  });

  const results = rows.map((row) => ({
    id: row.id,
    owner_id: row.owner_id,
    title: row.title ?? null,
    content_preview: row.content_preview ?? null,
    thumbnail_url: row.thumbnail_url ?? null,
    source_url: row.source_url ?? null,
    updated_at: row.updated_at,
  }));

  return res.success({ results });
}
