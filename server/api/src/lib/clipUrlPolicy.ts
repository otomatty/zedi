/**
 * clip-and-create / clipUrl で許可する URL ポリシー（SSRF 対策）
 *
 * 許可: http/https のみ。
 * 除外: localhost, loopback, プライベート IP, link-local, .local, chrome/about/file.
 * Policy for clip-and-create and clipUrl. Allows http/https only; rejects localhost, loopback, private IP, link-local, .local.
 */
export function isClipUrlAllowed(url: string): boolean {
  if (!url?.trim()) return false;
  try {
    const parsed = new URL(url.trim());
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
    let hostname = parsed.hostname.toLowerCase();
    // Node returns IPv6 hostnames with brackets e.g. "[::1]", "[fe80::1]"
    if (hostname.startsWith("[") && hostname.endsWith("]")) {
      hostname = hostname.slice(1, -1);
    }
    if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1") return false;
    if (hostname.endsWith(".localhost") || hostname.endsWith(".local")) return false;
    if (/^chrome\.?|^about$|^file$/i.test(hostname)) return false;
    // RFC 1918: 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16
    if (/^10\.|^192\.168\./.test(hostname)) return false;
    if (/^172\.(1[6-9]|2\d|3[01])(\.|$)/.test(hostname)) return false;
    // link-local (169.254.0.0/16, fe80::/10)
    if (/^169\.254\./.test(hostname)) return false;
    if (/^fe80:/i.test(hostname)) return false;
    return true;
  } catch {
    return false;
  }
}
