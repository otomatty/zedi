/**
 * Chrome 拡張用 Bearer JWT 認証ミドルウェア
 *
 * Authorization: Bearer トークンを検証し、clip:create スコープを確認する。
 */
import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import { verifyExtensionToken } from "../lib/extAuth.js";
import type { AppEnv } from "../types/index.js";

export /**
 *
 */
const extAuthRequired = createMiddleware<AppEnv>(async (c, next) => {
  /**
   *
   */
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    throw new HTTPException(401, { message: "Bearer token required" });
  }
  /**
   *
   */
  const token = authHeader.slice(7).trim();
  /**
   *
   */
  const payload = await verifyExtensionToken(token);
  if (!payload) {
    throw new HTTPException(401, { message: "Invalid or expired token" });
  }
  c.set("userId", payload.sub);
  await next();
});
