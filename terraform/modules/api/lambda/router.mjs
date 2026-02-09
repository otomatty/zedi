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

  // TODO C1-6: /api/notes/*
  // TODO C1-7: GET /api/search
  // TODO C1-8: /api/media/*

  return res.notFound("Not found");
}
