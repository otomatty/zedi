/**
 * /api/clip — Web クリッピング
 *
 * POST /api/clip/fetch — URL から HTML をサーバーサイドで取得（SSRF 対策あり）
 */
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { authRequired } from "../middleware/auth.js";
import { ClipFetchBlockedError, fetchClipHtmlWithRedirects } from "../lib/clipServerFetch.js";
import type { AppEnv } from "../types/index.js";

const app = new Hono<AppEnv>();

app.post("/fetch", authRequired, async (c) => {
  const body = await c.req.json<{ url?: string }>();

  if (!body.url?.trim()) {
    throw new HTTPException(400, { message: "url is required" });
  }

  const url = body.url.trim();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    try {
      const { html, finalUrl, contentType } = await fetchClipHtmlWithRedirects(url, controller);
      return c.json({
        html,
        url: finalUrl,
        content_type: contentType,
      });
    } catch (err) {
      if (err instanceof ClipFetchBlockedError) {
        throw new HTTPException(400, { message: err.message });
      }
      throw err;
    }
  } catch (err) {
    if (err instanceof HTTPException) throw err;
    if (err instanceof Error && err.name === "AbortError") {
      throw new HTTPException(502, { message: "Request timed out" });
    }
    if (err instanceof Error && err.message.startsWith("Fetch failed:")) {
      throw new HTTPException(502, { message: err.message });
    }
    throw new HTTPException(502, { message: "Fetch failed" });
  } finally {
    clearTimeout(timeout);
  }
});

export default app;
