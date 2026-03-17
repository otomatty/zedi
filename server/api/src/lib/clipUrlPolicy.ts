/**
 * clip-and-create / clipUrl で許可する URL ポリシー（SSRF 対策）
 *
 * 許可: http/https のみ。
 * 除外: localhost, loopback, プライベート IP, link-local, .local, chrome/about/file.
 * Policy for clip-and-create and clipUrl. Allows http/https only; rejects localhost, loopback, private IP, link-local, .local.
 */
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/**
 * 文字列の IP がプライベート・ループバック・link-local かどうかを判定する。
 * Returns true if the given IP string is private, loopback, or link-local.
 */
function isPrivateOrLoopbackOrLinkLocalIp(ip: string): boolean {
  const normalized = ip.toLowerCase().replace(/^\[|\]$/g, "");
  // IPv4
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(normalized)) {
    if (/^127\./.test(normalized)) return true;
    if (/^10\./.test(normalized)) return true;
    if (/^192\.168\./.test(normalized)) return true;
    if (/^172\.(1[6-9]|2\d|3[01])(\.|$)/.test(normalized)) return true;
    if (/^169\.254\./.test(normalized)) return true;
    if (/^0\.0\.0\.0$/.test(normalized)) return true;
    return false;
  }
  // IPv6: loopback, link-local (fe80::/10), Unique Local Address (fc00::/7, RFC 4193)
  if (normalized === "::1" || normalized === "::") return true;
  if (/^fe[89ab][0-9a-f]:/i.test(normalized)) return true; // fe80::/10 link-local
  if (/^f[cd][0-9a-f:]/i.test(normalized)) return true; // ULA fc00::/7 (colon for short form e.g. fc::1)
  if (/^::ffff:/i.test(normalized)) {
    const v4 = normalized.replace(/^::ffff:/i, "");
    return isPrivateOrLoopbackOrLinkLocalIp(v4);
  }
  return false;
}

/**
 * 文字列ベースで URL がクリップ許可対象かどうかを判定する（SSRF 対策）。
 * Checks whether the given URL is allowed for clipping based on string-level hostname rules (SSRF protection).
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
    if (hostname === "localhost" || /^127\./.test(hostname) || hostname === "::1") return false;
    if (
      hostname === "0.0.0.0" ||
      hostname === "::" ||
      hostname === "0000:0000:0000:0000:0000:0000:0000:0000"
    )
      return false;
    if (hostname.endsWith(".localhost") || hostname.endsWith(".local")) return false;
    if (/^(chrome|about|file)$/i.test(hostname)) return false;
    // IPv4-mapped IPv6 (::ffff:x.x.x.x) — reject all to prevent bypasses
    if (/^::ffff:/i.test(hostname)) return false;
    // RFC 1918: 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16
    if (/^10\.|^192\.168\./.test(hostname)) return false;
    if (/^172\.(1[6-9]|2\d|3[01])(\.|$)/.test(hostname)) return false;
    // link-local (169.254.0.0/16, fe80::/10), ULA (fc00::/7, RFC 4193)
    if (/^169\.254\./.test(hostname)) return false;
    if (/^fe[89ab][0-9a-f]:/i.test(hostname)) return false; // fe80::/10 link-local
    if (hostname.includes(":") && /^f[cd]/i.test(hostname)) return false; // IPv6 ULA (avoids blocking e.g. fcb.example.com)
    return true;
  } catch {
    return false;
  }
}

/**
 * DNS 解決後の IP がすべて公開アドレスであることを確認する（SSRF 対策）。
 * ホスト名がドメインの場合は resolve し、いずれかが private/loopback/link-local なら false。
 * Verifies that all resolved IPs for the URL hostname are public (no private/loopback/link-local).
 */
export async function isClipUrlAllowedAfterDns(url: string): Promise<boolean> {
  if (!isClipUrlAllowed(url)) return false;
  try {
    const parsed = new URL(url.trim());
    let hostname = parsed.hostname.toLowerCase();
    if (hostname.startsWith("[") && hostname.endsWith("]")) {
      hostname = hostname.slice(1, -1);
    }
    // ホスト名がすでに IP の場合は、private/ULA でなければ許可する（ULA 短縮形 fc::1 等もここで判定）。
    if (isIP(hostname) !== 0) return !isPrivateOrLoopbackOrLinkLocalIp(hostname);
    const result = await lookup(hostname, { all: true });
    const addresses = result.map((r) => r.address);
    if (addresses.length === 0) return false;
    const allPublic = addresses.every((addr) => !isPrivateOrLoopbackOrLinkLocalIp(addr));
    return allPublic;
  } catch {
    return false;
  }
}
