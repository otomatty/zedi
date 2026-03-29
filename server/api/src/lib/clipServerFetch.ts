/**
 * サーバー側クリップ用 URL 取得（SSRF 対策付きリダイレクト追従）
 * Server-side clip fetch with SSRF-safe manual redirect handling.
 */
import { isClipUrlAllowedAfterDns } from "./clipUrlPolicy.js";

const MAX_REDIRECTS = 5;

/**
 * clip fetch で拒否するときの API エラー文言（routes と共有）。
 * Shared API error message when a clip fetch URL is rejected.
 */
export const DISALLOWED_CLIP_URL_MESSAGE =
  "URL not allowed: only public http/https URLs are supported (no localhost, private IP, or internal hosts)";

/**
 * URL がポリシーに違反した場合に投げる（clip/fetch は 400 にマップする）。
 * Thrown when URL policy blocks a request; clip/fetch maps this to HTTP 400.
 */
export class ClipFetchBlockedError extends Error {
  /**
   * ブロック理由付きのエラー。Error with a stable name for policy violations.
   *
   * @param message - 人間可読メッセージ（API の error にそのまま載せる）。Human-readable message for API error body.
   */
  constructor(message = "URL not allowed") {
    super(message);
    this.name = "ClipFetchBlockedError";
  }
}

/**
 * DNS 解決込みで URL が許可されることを検証し、不可なら {@link ClipFetchBlockedError} を投げる。
 * Validates URL with DNS resolution; throws {@link ClipFetchBlockedError} if not allowed.
 */
export async function assertClipFetchUrlAllowed(url: string): Promise<void> {
  if (!(await isClipUrlAllowedAfterDns(url))) {
    throw new ClipFetchBlockedError(DISALLOWED_CLIP_URL_MESSAGE);
  }
}

/**
 * http(s) で HTML を取得する。リダイレクトは手動で追従し、各ホップで SSRF チェックを行う。
 * Fetches HTML over http(s) with manual redirects and SSRF checks on each hop.
 *
 * @param url - http(s)。初回 fetch の前に {@link assertClipFetchUrlAllowed} で再検証する。
 *   http(s) URL; re-validated with {@link assertClipFetchUrlAllowed} before the first fetch.
 * @param controller - AbortSignal 用。Abort controller for cancellation.
 * @returns 本文・最終 URL・Content-Type。Body, final URL, and Content-Type.
 */
export async function fetchClipHtmlWithRedirects(
  url: string,
  controller: AbortController,
): Promise<{ html: string; finalUrl: string; contentType: string }> {
  await assertClipFetchUrlAllowed(url);

  let response!: Response;
  let currentUrl = url;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    response = await fetch(currentUrl, {
      headers: {
        "User-Agent": "zedi-clip/1.0 (https://zedi.app)",
        Accept: "text/html,application/xhtml+xml,*/*;q=0.8",
      },
      redirect: "manual",
      signal: controller.signal,
    });
    const isRedirect =
      response.type === "opaqueredirect" || [301, 302, 303, 307, 308].includes(response.status);
    if (isRedirect) {
      const location = response.headers.get("Location");
      if (!location || hop === MAX_REDIRECTS) {
        throw new ClipFetchBlockedError("Redirect chain not allowed");
      }

      let nextUrl: string;
      try {
        nextUrl = new URL(location, currentUrl).href;
      } catch {
        throw new ClipFetchBlockedError("Invalid redirect Location");
      }

      await assertClipFetchUrlAllowed(nextUrl);
      currentUrl = nextUrl;
      continue;
    }
    break;
  }

  // `new Response()` 等では url が空のことがある。実リクエストでは response.url が最終 URL。
  // `new Response()` may leave url empty; real fetch sets the final URL on response.url.
  const finalUrlForPolicy = response.url || currentUrl;
  await assertClipFetchUrlAllowed(finalUrlForPolicy);

  if (!response.ok) {
    throw new Error(`Fetch failed: ${response.status}`);
  }

  const html = await response.text();
  const contentType = response.headers.get("content-type") || "";
  return { html, finalUrl: response.url || currentUrl, contentType };
}
