/**
 * ページ・同期 API: GET/POST /api/sync/pages
 * 自分のページのメタデータを差分同期（LWW）。links / ghost_links を含む。
 */

import * as res from "../responses.mjs";
import { execute } from "../lib/db.mjs";
import { resolveUserId } from "zedi-auth-db";

const GET_PAGES_SQL = `
SELECT id, owner_id, source_page_id, title, content_preview, thumbnail_url, source_url,
       created_at, updated_at, is_deleted
FROM pages
WHERE owner_id = :owner_id AND updated_at > CAST(:since AS timestamptz)
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
WHERE id = :id AND owner_id = :owner_id AND updated_at <= CAST(:client_updated_at AS timestamptz)
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
VALUES (CAST(:link_text AS text), :source_page_id, :original_target_page_id, :original_note_id)
ON CONFLICT (link_text, source_page_id) DO NOTHING
`;

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
  const ownerId = await resolveUserId(claims?.sub, execute);
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
  console.log("[SYNC_DEBUG] GET sync/pages: page_ids count", ids.length, "csv length", pageIdsCsv.length);
  const linksRows = await execute(GET_LINKS_SQL, {
    page_ids_csv: pageIdsCsv,
  });
  const ghostRows = await execute(GET_GHOST_LINKS_SQL, {
    page_ids_csv: pageIdsCsv,
  });
  console.log("[SYNC_DEBUG] GET sync/pages: links", linksRows.length, "ghost_links", ghostRows.length);

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
  const ownerId = await resolveUserId(claims?.sub, execute);
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
    console.log("[SYNC_DEBUG] links: delete for owner, then insert", linkList.length, "links");
    await execute(DELETE_LINKS_FOR_OWNER_SQL, { owner_id: ownerId });
    for (let i = 0; i < linkList.length; i++) {
      const l = linkList[i];
      const sid = l?.source_id ?? l?.sourceId;
      const tid = l?.target_id ?? l?.targetId;
      if (sid && tid && myPageIds.includes(sid) && myPageIds.includes(tid)) {
        console.log("[SYNC_DEBUG] INSERT_LINK", { i, source_id: sid?.slice(0, 8), target_id: tid?.slice(0, 8) });
        await execute(INSERT_LINK_SQL, { source_id: sid, target_id: tid });
      }
    }
  }
  if (Array.isArray(ghostList)) {
    console.log("[SYNC_DEBUG] ghost_links: delete for owner, then insert", ghostList.length, "rows");
    await execute(DELETE_GHOST_LINKS_FOR_OWNER_SQL, { owner_id: ownerId });
    for (let i = 0; i < ghostList.length; i++) {
      const g = ghostList[i];
      const linkText = g?.link_text ?? g?.linkText ?? "";
      const sourcePageId = g?.source_page_id ?? g?.sourcePageId;
      if (!sourcePageId || !myPageIds.includes(sourcePageId)) continue;
      const looksLikeUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(linkText);
      console.log("[SYNC_DEBUG] INSERT_GHOST_LINK", {
        i,
        link_text: linkText.slice(0, 60),
        link_text_length: linkText.length,
        link_text_looks_like_uuid: looksLikeUuid,
        source_page_id: sourcePageId?.slice(0, 8),
      });
      try {
        await execute(INSERT_GHOST_LINK_SQL, {
          link_text: linkText,
          source_page_id: sourcePageId,
          original_target_page_id: g?.original_target_page_id ?? g?.originalTargetPageId ?? null,
          original_note_id: g?.original_note_id ?? g?.originalNoteId ?? null,
        });
      } catch (err) {
        console.error("[SYNC_DEBUG] INSERT_GHOST_LINK failed at index", i, {
          link_text: linkText.slice(0, 80),
          source_page_id: sourcePageId,
          error: err?.message,
        });
        throw err;
      }
    }
  }

  return res.success({
    server_time: serverTime,
    conflicts,
  });
}
