/**
 * ルーター: path + method でハンドラーにディスパッチ
 * C1-3 以降で /api/users, /api/sync/pages 等を追加
 */

import * as res from "./responses.mjs";

/**
 * @typedef {Object} ApiContext
 * @property {Record<string, string>|undefined} claims
 * @property {Record<string, unknown>|null} [body]
 * @property {Record<string, string>} [pathParameters]
 * @property {Record<string, string>} [queryStringParameters]
 */

/**
 * @param {string} rawPath - e.g. "/api" or "/api/users/123"
 * @param {string} method
 * @param {ApiContext} ctx
 * @returns {Promise<{ statusCode: number; headers: Record<string, string>; body: string }>}
 */
export async function route(rawPath, method, ctx) {
  const path = rawPath.replace(/^\/api\/?/, "") || "";
  const segments = path ? path.split("/").filter(Boolean) : [];

  if (method === "OPTIONS") {
    return res.corsPreflight();
  }

  // GET /api/health — 認証なしルートでも Lambda に来る
  if (method === "GET" && (path === "health" || segments[0] === "health")) {
    return res.success({ status: "ok", service: "zedi-api" });
  }

  // 認証必須ルート（JWT 通過後のみ到達）
  const claims = ctx.claims;
  if (!claims?.sub) {
    return res.unauthorized("Missing or invalid token");
  }

  // GET /api/me — 現在ユーザー情報（claims のみ；DB の users は GET /api/users/:id で取得）
  if (method === "GET" && (path === "me" || segments[0] === "me")) {
    return res.success({
      sub: claims.sub,
      email: claims.email ?? claims["cognito:username"],
    });
  }

  // POST /api/users/upsert — Cognito sub/email から users を upsert
  if (method === "POST" && segments[0] === "users" && segments[1] === "upsert") {
    const { upsert: upsertUser } = await import("./handlers/users.mjs");
    return upsertUser(claims, ctx.body);
  }

  // GET /api/users/:id
  if (method === "GET" && segments[0] === "users" && segments[1]) {
    const { getById } = await import("./handlers/users.mjs");
    return getById(segments[1]);
  }

  // GET /api/sync/pages?since= — 差分取得（自分のページメタデータ + links + ghost_links）
  if (method === "GET" && segments[0] === "sync" && segments[1] === "pages") {
    const { getSyncPages } = await import("./handlers/syncPages.mjs");
    const query = ctx.queryStringParameters ?? {};
    return getSyncPages(claims, query);
  }

  // POST /api/sync/pages — ローカル変更の一括送信（LWW、conflicts 返却）
  if (method === "POST" && segments[0] === "sync" && segments[1] === "pages") {
    const { postSyncPages } = await import("./handlers/syncPages.mjs");
    return postSyncPages(claims, ctx.body);
  }

  // GET /api/pages/:id/content
  if (method === "GET" && segments[0] === "pages" && segments[1] && segments[2] === "content") {
    const { getPageContent } = await import("./handlers/pages.mjs");
    return getPageContent(claims, segments[1]);
  }

  // PUT /api/pages/:id/content
  if (method === "PUT" && segments[0] === "pages" && segments[1] && segments[2] === "content") {
    const { putPageContent } = await import("./handlers/pages.mjs");
    return putPageContent(claims, segments[1], ctx.body);
  }

  // POST /api/pages
  if (method === "POST" && segments[0] === "pages" && !segments[1]) {
    const { createPage } = await import("./handlers/pages.mjs");
    return createPage(claims, ctx.body);
  }

  // DELETE /api/pages/:id
  if (method === "DELETE" && segments[0] === "pages" && segments[1] && !segments[2]) {
    const { deletePage } = await import("./handlers/pages.mjs");
    return deletePage(claims, segments[1]);
  }

  // --- /api/notes (C1-6) ---
  if (segments[0] === "notes") {
    const noteId = segments[1];
    const subResource = segments[2]; // "pages" | "members"
    const subId = segments[3];

    if (method === "GET" && !noteId) {
      const { listNotes } = await import("./handlers/notes.mjs");
      return listNotes(claims);
    }
    if (method === "GET" && noteId && !subResource) {
      const { getNote } = await import("./handlers/notes.mjs");
      return getNote(claims, noteId);
    }
    if (method === "POST" && !noteId) {
      const { createNote } = await import("./handlers/notes.mjs");
      return createNote(claims, ctx.body);
    }
    if (method === "PUT" && noteId && !subResource) {
      const { updateNote } = await import("./handlers/notes.mjs");
      return updateNote(claims, noteId, ctx.body);
    }
    if (method === "DELETE" && noteId && !subResource) {
      const { deleteNote } = await import("./handlers/notes.mjs");
      return deleteNote(claims, noteId);
    }
    if (method === "POST" && noteId && subResource === "pages") {
      const { addNotePage } = await import("./handlers/notes.mjs");
      return addNotePage(claims, noteId, ctx.body);
    }
    if (method === "DELETE" && noteId && subResource === "pages" && subId) {
      const { removeNotePage } = await import("./handlers/notes.mjs");
      return removeNotePage(claims, noteId, subId);
    }
    if (method === "GET" && noteId && subResource === "members") {
      const { listNoteMembers } = await import("./handlers/notes.mjs");
      return listNoteMembers(claims, noteId);
    }
    if (method === "POST" && noteId && subResource === "members") {
      const { addNoteMember } = await import("./handlers/notes.mjs");
      return addNoteMember(claims, noteId, ctx.body);
    }
    if (method === "DELETE" && noteId && subResource === "members" && subId) {
      const { removeNoteMember } = await import("./handlers/notes.mjs");
      return removeNoteMember(claims, noteId, subId);
    }
  }

  // GET /api/search?q=&scope=shared — 共有ノートの全文検索（pg_bigm）
  if (method === "GET" && segments[0] === "search") {
    const { searchShared } = await import("./handlers/search.mjs");
    const query = ctx.queryStringParameters ?? {};
    return searchShared(claims, query);
  }

  // POST /api/media/upload — Presigned URL 発行
  if (method === "POST" && segments[0] === "media" && segments[1] === "upload") {
    const { upload: mediaUpload } = await import("./handlers/media.mjs");
    return mediaUpload(claims, ctx.body);
  }

  // POST /api/media/confirm — アップロード完了確認（media テーブル登録）
  if (method === "POST" && segments[0] === "media" && segments[1] === "confirm") {
    const { confirm: mediaConfirm } = await import("./handlers/media.mjs");
    return mediaConfirm(claims, ctx.body);
  }

  return res.notFound("Not found");
}
