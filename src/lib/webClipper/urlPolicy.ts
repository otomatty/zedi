/**
 * Web Clipper 用 URL 検証（有効URL・クリップ許可URL）。
 * URL validation for Web Clipper (valid URL, clip-allowed URL).
 */

/**
 * URL が http/https として有効かどうかを検証する。
 * Validates that the URL is a valid http or https URL.
 */
export function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Chrome拡張・clipUrl連携で許可するURLかどうかを検証。サーバー側 clipUrlPolicy と同一ルール。
 * 許可: http/https のみ。除外: localhost, loopback, プライベートIP, link-local, .local, chrome/about/file。
 * Validates clipUrl from Chrome extension etc. Same rules as server clipUrlPolicy.
 */
export function isClipUrlAllowed(url: string): boolean {
  if (!url?.trim()) return false;
  try {
    const parsed = new URL(url.trim());
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
    let hostname = parsed.hostname.toLowerCase();
    if (hostname.startsWith("[") && hostname.endsWith("]")) {
      hostname = hostname.slice(1, -1);
    }
    if (hostname === "localhost" || /^127\./.test(hostname) || hostname === "::1") return false;
    if (
      hostname === "0.0.0.0" ||
      hostname === "::" ||
      hostname === "0000:0000:0000:0000:0000:0000:0000:0000"
    )
      return false;
    if (hostname.endsWith(".localhost") || hostname.endsWith(".local")) return false;
    if (/^(chrome|about|file)$/i.test(hostname)) return false;
    if (/^::ffff:/i.test(hostname)) return false;
    if (/^10\.|^192\.168\./.test(hostname)) return false;
    if (/^172\.(1[6-9]|2\d|3[01])(\.|$)/.test(hostname)) return false;
    if (/^169\.254\./.test(hostname)) return false;
    if (/^fe[89ab][0-9a-f]:/i.test(hostname)) return false; // fe80::/10 link-local / fe80::/10 リンクローカル
    if (hostname.includes(":") && /^f[cd]/i.test(hostname)) return false; // IPv6 ULA (fc00::/7); : guard avoids blocking e.g. fcb.example.com
    return true;
  } catch {
    return false;
  }
}
