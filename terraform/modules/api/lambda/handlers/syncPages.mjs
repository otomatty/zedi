/**
 * ページ・同期 API: GET/POST /api/sync/pages
 * 自分のページのメタデータを差分同期（LWW）。links / ghost_links を含む。
 */

import * as res from "../responses.mjs";
import { execute } from "../lib/db.mjs";

const GET_USER_ID_SQL = `
SELECT id FROM users WHERE cognito_sub = :cognito_sub
`;

const GET_PAGES_SQL = `
SELECT id, owner_id, source_page_id, title, content_preview, thumbnail_url, source_url,
       created_at, updated_at, is_deleted
FROM pages
WHERE owner_id = :owner_id AND updated_at > :since
ORDER BY updated_at ASC
`;

const GET_PAGES_NO_SINCE_SQL = `
SELECT id, owner_id, source_page_id, title, content_preview, thumbnail_url, source_url,
       created_at, updated_at, is_deleted
FROM pages
WHERE owner_id = :owner_id
ORDER BY updated_at ASC
`;

const GET_MY_PAGE_IDS_SQL = `
SELECT id FROM pages WHERE owner_id = :owner_id
`;

const GET_LINKS_SQL = `
SELECT source_id, target_id, created_at
FROM links
WHERE source_id = ANY(ARRAY(SELECT unnest(string_to_array(:page_ids_csv, ','))::uuid))
  AND target_id = ANY(ARRAY(SELECT unnest(string_to_array(:page_ids_csv, ','))::uuid))
`;

const GET_GHOST_LINKS_SQL = `
SELECT link_text, source_page_id, created_at, original_target_page_id, original_note_id
FROM ghost_links
WHERE source_page_id = ANY(ARRAY(SELECT unnest(string_to_array(:page_ids_csv, ','))::uuid))
`;

const GET_PAGE_UPDATED_SQL = `
SELECT id, updated_at FROM pages WHERE id = :id AND owner_id = :owner_id
`;

const INSERT_PAGE_SQL = `
INSERT INTO pages (id, owner_id, source_page_id, title, content_preview, thumbnail_url, source_url, is_deleted)
VALUES (:id, :owner_id, :source_page_id, :title, :content_preview, :thumbnail_url, :source_url, :is_deleted)
RETURNING id, owner_id, source_page_id, title, content_preview, thumbnail_url, source_url, created_at, updated_at, is_deleted
`;

const UPDATE_PAGE_SQL = `
UPDATE pages
SET source_page_id = :source_page_id, title = :title, content_preview = :content_preview,
    thumbnail_url = :thumbnail_url, source_url = :source_url, is_deleted = :is_deleted, updated_at = NOW()
WHERE id = :id AND owner_id = :owner_id AND updated_at <= :client_updated_at
RETURNING id
`;

const DELETE_LINKS_FOR_OWNER_SQL = `
DELETE FROM links WHERE source_id IN (SELECT id FROM pages WHERE owner_id = :owner_id)
`;

const INSERT_LINK_SQL = `
INSERT INTO links (source_id, target_id) VALUES (:source_id, :target_id)
ON CONFLICT (source_id, target_id) DO NOTHING
`;

const DELETE_GHOST_LINKS_FOR_OWNER_SQL = `
DELETE FROM ghost_links WHERE source_page_id IN (SELECT id FROM pages WHERE owner_id = :owner_id)
`;

const INSERT_GHOST_LINK_SQL = `
INSERT INTO ghost_links (link_text, source_page_id, original_target_page_id, original_note_id)
VALUES (:link_text, :source_page_id, :original_target_page_id, :original_note_id)
ON CONFLICT (link_text, source_page_id) DO NOTHING
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

function rowToLink(row) {
  return {
    source_id: row.source_id,
    target_id: row.target_id,
    created_at: row.created_at,
  };
}

function rowToGhostLink(row) {
  return {
    link_text: row.link_text,
    source_page_id: row.source_page_id,
    created_at: row.created_at,
    original_target_page_id: row.original_target_page_id ?? null,
    original_note_id: row.original_note_id ?? null,
  };
}

/**
 * GET /api/sync/pages?since={ISO8601}
 * 自分のページの差分（since 以降）と、自分のページに紐づく links / ghost_links を返す。
 * @param {{ sub: string }} claims
 * @param {{ since?: string }} query
 */
export async function getSyncPages(claims, query = {}) {
  const ownerId = await getOwnerId(claims);
  if (!ownerId) return res.unauthorized("User not found");

  const since = query?.since?.trim();
  const pages =
    since ?
      await execute(GET_PAGES_SQL, { owner_id: ownerId, since })
    : await execute(GET_PAGES_NO_SINCE_SQL, { owner_id: ownerId });

  const pageIds = await execute(GET_MY_PAGE_IDS_SQL, { owner_id: ownerId });
  const ids = pageIds.map((r) => r.id);
  if (ids.length === 0) {
    return res.success({
      pages: pages.map(rowToPage),
      links: [],
      ghost_links: [],
      server_time: new Date().toISOString(),
    });
  }

  const pageIdsCsv = ids.join(",");
  const linksRows = await execute(GET_LINKS_SQL, {
    page_ids_csv: pageIdsCsv,
  });
  const ghostRows = await execute(GET_GHOST_LINKS_SQL, {
    page_ids_csv: pageIdsCsv,
  });

  return res.success({
    pages: pages.map(rowToPage),
    links: linksRows.map(rowToLink),
    ghost_links: ghostRows.map(rowToGhostLink),
    server_time: new Date().toISOString(),
  });
}

/**
 * POST /api/sync/pages
 * Body: { pages: [...], links?: [...], ghost_links?: [...] }
 * pages: LWW（updated_at が新しい方を採用）。競合した場合は conflicts に含める。
 * links / ghost_links: 自分のページに紐づく分をまとめて置き換え。
 * @param {{ sub: string }} claims
 * @param {{ pages?: Array<Record<string, unknown>>; links?: Array<Record<string, unknown>>; ghost_links?: Array<Record<string, unknown>> }} body
 */
export async function postSyncPages(claims, body = {}) {
  const ownerId = await getOwnerId(claims);
  if (!ownerId) return res.unauthorized("User not found");

  const serverTime = new Date().toISOString();
  const pageList = Array.isArray(body?.pages) ? body.pages : [];
  const conflicts = [];

  for (const p of pageList) {
    const id = p?.id;
    if (!id) continue;
    const clientUpdatedAt = p?.updated_at ?? serverTime;

    const existing = await execute(GET_PAGE_UPDATED_SQL, {
      id,
      owner_id: ownerId,
    });
    const row = existing[0];

    if (!row) {
      await execute(INSERT_PAGE_SQL, {
        id,
        owner_id: ownerId,
        source_page_id: p.source_page_id ?? null,
        title: p.title ?? null,
        content_preview: p.content_preview ?? null,
        thumbnail_url: p.thumbnail_url ?? null,
        source_url: p.source_url ?? null,
        is_deleted: p.is_deleted === true,
      });
      continue;
    }

    const serverUpdatedAt = row.updated_at;
    if (new Date(clientUpdatedAt) < new Date(serverUpdatedAt)) {
      conflicts.push({ id, server_updated_at: serverUpdatedAt });
      continue;
    }

    await execute(UPDATE_PAGE_SQL, {
      id,
      owner_id: ownerId,
      source_page_id: p.source_page_id ?? null,
      title: p.title ?? null,
      content_preview: p.content_preview ?? null,
      thumbnail_url: p.thumbnail_url ?? null,
      source_url: p.source_url ?? null,
      is_deleted: p.is_deleted === true,
      client_updated_at: clientUpdatedAt,
    });
  }

  const myPageIds = (await execute(GET_MY_PAGE_IDS_SQL, { owner_id: ownerId })).map((r) => r.id);
  const linkList = body?.links;
  const ghostList = body?.ghost_links;

  if (Array.isArray(linkList)) {
    await execute(DELETE_LINKS_FOR_OWNER_SQL, { owner_id: ownerId });
    for (const l of linkList) {
      const sid = l?.source_id ?? l?.sourceId;
      const tid = l?.target_id ?? l?.targetId;
      if (sid && tid && myPageIds.includes(sid) && myPageIds.includes(tid)) {
        await execute(INSERT_LINK_SQL, { source_id: sid, target_id: tid });
      }
    }
  }
  if (Array.isArray(ghostList)) {
    await execute(DELETE_GHOST_LINKS_FOR_OWNER_SQL, { owner_id: ownerId });
    for (const g of ghostList) {
      const linkText = g?.link_text ?? g?.linkText ?? "";
      const sourcePageId = g?.source_page_id ?? g?.sourcePageId;
      if (!sourcePageId || !myPageIds.includes(sourcePageId)) continue;
      await execute(INSERT_GHOST_LINK_SQL, {
        link_text: linkText,
        source_page_id: sourcePageId,
        original_target_page_id: g?.original_target_page_id ?? g?.originalTargetPageId ?? null,
        original_note_id: g?.original_note_id ?? g?.originalNoteId ?? null,
      });
    }
  }

  return res.success({
    server_time: serverTime,
    conflicts,
  });
}
