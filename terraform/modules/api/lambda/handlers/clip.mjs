/**
 * Web Clipping: サーバー側で URL の HTML を取得（CORS 回避）
 * POST /api/clip/fetch { url } → { html }
 */

import * as res from "../responses.mjs";

const ALLOWED_PROTOCOLS = ["http:", "https:"];
const FETCH_TIMEOUT_MS = 15_000;

/**
 * @param {Record<string, string>|undefined} _claims
 * @param {{ url?: string }|null} body
 * @returns {Promise<{ statusCode: number; headers: Record<string, string>; body: string }>}
 */
export async function fetchHtml(_claims, body) {
  const url = body?.url;
  if (!url || typeof url !== "string") {
    return res.badRequest("Missing or invalid url");
  }

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return res.badRequest("Invalid URL format");
  }
  if (!ALLOWED_PROTOCOLS.includes(parsed.protocol)) {
    return res.badRequest("Only http and https URLs are allowed");
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "User-Agent": "Mozilla/5.0 (compatible; ZediClip/1.0; +https://zedi-note.app)",
      },
      redirect: "follow",
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      return res.error(
        `Failed to fetch: ${response.status} ${response.statusText}`,
        response.status >= 500 ? 502 : 400,
        "FETCH_FAILED",
      );
    }

    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("text/html") && !contentType.includes("application/xhtml")) {
      return res.badRequest("URL did not return HTML");
    }

    const html = await response.text();
    return res.success({ html });
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === "AbortError") {
      return res.error("Request timed out", 504, "TIMEOUT");
    }
    console.error("Clip fetch error:", err);
    return res.error(err.message || "Failed to fetch URL", 502, "FETCH_FAILED");
  }
}
