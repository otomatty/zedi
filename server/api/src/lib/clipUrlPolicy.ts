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
  // IPv6
  if (normalized === "::1" || normalized === "::") return true;
  if (/^fe80:/i.test(normalized)) return true;
  if (/^::ffff:/i.test(normalized)) {
    const v4 = normalized.replace(/^::ffff:/i, "");
    return isPrivateOrLoopbackOrLinkLocalIp(v4);
  }
  return false;
}

/**
 *
 */
export function isClipUrlAllowed(url: string): boolean {
  if (!url?.trim()) return false;
  try {
    /**
     *
     */
    const parsed = new URL(url.trim());
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
    /**
     *
     */
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
    // link-local (169.254.0.0/16, fe80::/10)
    if (/^169\.254\./.test(hostname)) return false;
    if (/^fe80:/i.test(hostname)) return false;
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
    // すでに IP の場合は isClipUrlAllowed で弾かれているためここには来ない（公開 IP のみ）
    if (isIP(hostname) !== 0) return true;
    const result = await lookup(hostname, { all: true });
    const addresses = result.map((r) => r.address);
    if (addresses.length === 0) return false;
    const allPublic = addresses.every((addr) => !isPrivateOrLoopbackOrLinkLocalIp(addr));
    return allPublic;
  } catch {
    return false;
  }
}
