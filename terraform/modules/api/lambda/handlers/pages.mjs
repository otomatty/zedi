/**
 * ページ・コンテンツ API: GET/PUT /api/pages/:id/content, POST /api/pages, DELETE /api/pages/:id
 * C1-5: 自分のページのみ。Y.Doc は page_contents(ydoc_state, version) で管理。
 */

import * as res from "../responses.mjs";
import { execute } from "../lib/db.mjs";

const GET_USER_ID_SQL = `
SELECT id FROM users WHERE cognito_sub = :cognito_sub
`;

const GET_PAGE_OWNER_SQL = `
SELECT id, owner_id FROM pages WHERE id = :id AND is_deleted = FALSE
`;

const GET_CONTENT_SQL = `
SELECT encode(pc.ydoc_state, 'base64') AS ydoc_state_b64, pc.version
FROM page_contents pc
JOIN pages p ON p.id = pc.page_id
WHERE pc.page_id = :page_id AND p.owner_id = :owner_id
`;

const UPSERT_CONTENT_SQL = `
INSERT INTO page_contents (page_id, ydoc_state, version, content_text, updated_at)
VALUES (
  :page_id,
  decode(:ydoc_state_b64, 'base64'),
  1,
  :content_text,
  NOW()
)
ON CONFLICT (page_id) DO UPDATE SET
  ydoc_state = decode(:ydoc_state_b64, 'base64'),
  version = page_contents.version + 1,
  content_text = COALESCE(NULLIF(TRIM(:content_text), ''), page_contents.content_text),
  updated_at = NOW()
RETURNING version
`;

const UPSERT_CONTENT_OPTIMISTIC_SQL = `
UPDATE page_contents
SET ydoc_state = decode(:ydoc_state_b64, 'base64'),
    version = version + 1,
    content_text = COALESCE(NULLIF(TRIM(:content_text), ''), content_text),
    updated_at = NOW()
WHERE page_id = :page_id
  AND (SELECT owner_id FROM pages WHERE id = :page_id) = :owner_id
  AND version = :expected_version
RETURNING version
`;

/** Update pages.content_preview from content_text (first 200 chars) when saving content. */
const UPDATE_PAGE_PREVIEW_SQL = `
UPDATE pages
SET content_preview = CASE
  WHEN NULLIF(TRIM(:content_text), '') IS NOT NULL THEN LEFT(TRIM(:content_text), 200)
  ELSE content_preview
END,
updated_at = NOW()
WHERE id = :page_id AND owner_id = :owner_id
`;

const INSERT_PAGE_SQL = `
INSERT INTO pages (id, owner_id, source_page_id, title, content_preview, thumbnail_url, source_url)
VALUES (
  COALESCE(NULLIF(TRIM(COALESCE(:id, '')), '')::uuid, gen_random_uuid()),
  :owner_id,
  :source_page_id,
  :title,
  :content_preview,
  :thumbnail_url,
  :source_url
)
RETURNING id, owner_id, source_page_id, title, content_preview, thumbnail_url, source_url, created_at, updated_at, is_deleted
`;

const DELETE_PAGE_SQL = `
UPDATE pages SET is_deleted = TRUE, updated_at = NOW()
WHERE id = :id AND owner_id = :owner_id
RETURNING id
`;

/**
 * JWT claims から owner_id (users.id UUID) を取得する
 * @param {{ sub: string }} claims
 * @returns {Promise<string|null>}
 */
async function getOwnerId(claims) {
  const sub = claims?.sub;
  if (!sub) return null;
  const rows = await execute(GET_USER_ID_SQL, { cognito_sub: sub });
  return rows[0]?.id ?? null;
}

/**
 * ページが現在ユーザー所有か確認する
 * @param {string} pageId
 * @param {string} ownerId
 * @returns {Promise<boolean>}
 */
async function isPageOwnedBy(pageId, ownerId) {
  const rows = await execute(GET_PAGE_OWNER_SQL, { id: pageId });
  return rows[0]?.owner_id === ownerId;
}

/**
 * GET /api/pages/:id/content
 * 自分のページの Y.Doc 状態と version を返す。未保存なら 404。
 */
export async function getPageContent(claims, pageId) {
  const ownerId = await getOwnerId(claims);
  if (!ownerId) return res.unauthorized("User not found");

  if (!pageId) return res.badRequest("Page id is required");

  const owned = await isPageOwnedBy(pageId, ownerId);
  if (!owned) return res.notFound("Page not found");

  const rows = await execute(GET_CONTENT_SQL, { page_id: pageId, owner_id: ownerId });
  const row = rows[0];
  if (!row) return res.notFound("Page content not found");

  return res.success({
    ydoc_state: row.ydoc_state_b64 ?? null,
    version: row.version ?? 1,
  });
}

/**
 * PUT /api/pages/:id/content
 * Body: { ydoc_state: string (base64), content_text?: string, version?: number }
 * version を送った場合は楽観的ロック（一致しないと 409）。
 */
export async function putPageContent(claims, pageId, body = {}) {
  const ownerId = await getOwnerId(claims);
  if (!ownerId) return res.unauthorized("User not found");

  if (!pageId) return res.badRequest("Page id is required");

  const ydocStateB64 = body?.ydoc_state;
  if (typeof ydocStateB64 !== "string" || !ydocStateB64.trim()) {
    return res.badRequest("ydoc_state (base64) is required");
  }

  const owned = await isPageOwnedBy(pageId, ownerId);
  if (!owned) return res.notFound("Page not found");

  const contentText = body?.content_text ?? null;
  const expectedVersion = body?.version;

  const contentTextParam = contentText ?? "";

  if (expectedVersion != null && Number.isInteger(expectedVersion)) {
    const updated = await execute(UPSERT_CONTENT_OPTIMISTIC_SQL, {
      page_id: pageId,
      owner_id: ownerId,
      ydoc_state_b64: ydocStateB64.trim(),
      content_text: contentTextParam,
      expected_version: expectedVersion,
    });
    if (updated.length === 0) {
      return res.error("Version conflict", 409, "VERSION_CONFLICT");
    }
    await execute(UPDATE_PAGE_PREVIEW_SQL, {
      page_id: pageId,
      owner_id: ownerId,
      content_text: contentTextParam,
    });
    return res.success({ version: updated[0].version });
  }

  const rows = await execute(UPSERT_CONTENT_SQL, {
    page_id: pageId,
    ydoc_state_b64: ydocStateB64.trim(),
    content_text: contentTextParam,
  });
  const version = rows[0]?.version ?? 1;
  await execute(UPDATE_PAGE_PREVIEW_SQL, {
    page_id: pageId,
    owner_id: ownerId,
    content_text: contentTextParam,
  });
  return res.success({ version });
}

/**
 * POST /api/pages
 * Body: { id?: string (UUID), title?, content_preview?, source_page_id?, thumbnail_url?, source_url? }
 */
export async function createPage(claims, body = {}) {
  const ownerId = await getOwnerId(claims);
  if (!ownerId) return res.unauthorized("User not found");

  const id = body?.id?.trim() || null;
  const title = body?.title ?? null;
  const content_preview = body?.content_preview ?? null;
  const source_page_id = body?.source_page_id ?? body?.sourcePageId ?? null;
  const thumbnail_url = body?.thumbnail_url ?? body?.thumbnailUrl ?? null;
  const source_url = body?.source_url ?? body?.sourceUrl ?? null;

  const rows = await execute(INSERT_PAGE_SQL, {
    id: id || undefined,
    owner_id: ownerId,
    source_page_id: source_page_id || null,
    title: title || null,
    content_preview: content_preview || null,
    thumbnail_url: thumbnail_url || null,
    source_url: source_url || null,
  });
  const row = rows[0];
  if (!row) return res.error("Create page failed", 500, "DB_ERROR");

  return res.success(rowToPage(row));
}

/**
 * DELETE /api/pages/:id
 * 論理削除（is_deleted = true）。
 */
export async function deletePage(claims, pageId) {
  const ownerId = await getOwnerId(claims);
  if (!ownerId) return res.unauthorized("User not found");

  if (!pageId) return res.badRequest("Page id is required");

  const rows = await execute(DELETE_PAGE_SQL, { id: pageId, owner_id: ownerId });
  if (rows.length === 0) return res.notFound("Page not found");

  return res.success({ id: pageId, deleted: true });
}

function rowToPage(row) {
  return {
    id: row.id,
    owner_id: row.owner_id,
    source_page_id: row.source_page_id ?? null,
    title: row.title ?? null,
    content_preview: row.content_preview ?? null,
    thumbnail_url: row.thumbnail_url ?? null,
    source_url: row.source_url ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    is_deleted: row.is_deleted === true,
  };
}
