/**
 * ルーター: path + method でハンドラーにディスパッチ
 * C1-3 以降で /api/users, /api/sync/pages 等を追加
 */

import * as res from "./responses.mjs";

/**
 * @param {string} rawPath - e.g. "/api" or "/api/users/123"
 * @param {string} method
 * @param {import("./index.mjs").ApiContext} ctx
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

  // GET /api/me — 現在ユーザー情報（C1-3 で users と連携）
  if (method === "GET" && (path === "me" || segments[0] === "me")) {
    return res.success({
      sub: claims.sub,
      email: claims.email ?? claims["cognito:username"],
    });
  }

  // TODO C1-3: POST /api/users/upsert, GET /api/users/:id
  // TODO C1-4: GET/POST /api/sync/pages
  // TODO C1-5: /api/pages/*
  // TODO C1-6: /api/notes/*
  // TODO C1-7: GET /api/search
  // TODO C1-8: /api/media/*

  return res.notFound("Not found");
}
