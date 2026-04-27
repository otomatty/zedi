/**
 * クライアント側のドメイン入力検証 (`note_domain_access`, issue #663)。
 * サーバー側 `server/api/src/lib/freeEmailDomains.ts` のロジックをミラーし、
 * UI でのインライン警告に使う。最終判定はサーバー側で行うため、これは
 * 「送信前に明確に弾けるものを早めに弾く」目的のソフトな検証。
 *
 * Client-side domain input validation for `note_domain_access` (issue #663).
 * Mirrors `server/api/src/lib/freeEmailDomains.ts` so the share-modal domain
 * tab can warn users before they submit. The server remains the source of
 * truth — this is intentionally a soft pre-check.
 */

/**
 * 拒否対象の無料メールドメイン（小文字・`@` なし）。サーバーの拒否リストと
 * 同期させる。差分が出てもサーバーが最終判定するため致命的ではない。
 *
 * Free-webmail providers blocked for domain rules. Kept in sync with the
 * server list; small drift is non-fatal because the server enforces the truth.
 */
export const FREE_EMAIL_DOMAINS: ReadonlySet<string> = new Set([
  // Google
  "gmail.com",
  "googlemail.com",
  // Microsoft
  "outlook.com",
  "outlook.jp",
  "hotmail.com",
  "hotmail.co.jp",
  "live.com",
  "live.jp",
  "msn.com",
  // Yahoo
  "yahoo.com",
  "yahoo.co.jp",
  "ymail.com",
  // Apple
  "icloud.com",
  "me.com",
  "mac.com",
  // Other major free webmail
  "aol.com",
  "proton.me",
  "protonmail.com",
  "pm.me",
  "gmx.com",
  "gmx.net",
  "mail.com",
  "zoho.com",
  "yandex.com",
  "yandex.ru",
  // Japanese carriers / ISP free tiers
  "docomo.ne.jp",
  "ezweb.ne.jp",
  "softbank.ne.jp",
  "i.softbank.jp",
  "ybb.ne.jp",
  "nifty.com",
  "so-net.ne.jp",
  "biglobe.ne.jp",
  "ocn.ne.jp",
  // Disposable / throwaway (representative)
  "mailinator.com",
  "guerrillamail.com",
  "10minutemail.com",
  "tempmail.com",
  "trashmail.com",
]);

/**
 * ドメイン検証エラーの判別共用体。
 * Discriminated error kinds for client-side domain validation.
 */
export type DomainValidationError =
  | { kind: "empty" }
  | { kind: "invalid_format" }
  | { kind: "free_email"; domain: string };

/**
 * 入力検証の結果。成功時は正規化済みドメイン、失敗時は理由。
 * Validation result — normalised domain on success, otherwise an error kind.
 */
export type DomainValidationResult =
  | { ok: true; domain: string }
  | { ok: false; error: DomainValidationError };

/**
 * RFC 1035 ベースのラフなドメイン検証。サーバーのものと同一。
 * Lightweight RFC 1035 domain check; mirrors the server regex.
 */
const DOMAIN_REGEX = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/;

/**
 * 生のドメイン入力を正規化・検証する。
 *
 * Normalise and validate a raw domain input:
 * - trim & lower-case
 * - strip a single leading `@` (so `@example.com` and `example.com` both work)
 * - reject empty strings, malformed domains, and free-webmail providers.
 *
 * @param raw - ユーザー入力 / Raw user input.
 */
export function normalizeDomainInput(raw: unknown): DomainValidationResult {
  if (typeof raw !== "string") {
    return { ok: false, error: { kind: "empty" } };
  }
  let value = raw.trim().toLowerCase();
  if (value.startsWith("@")) {
    value = value.slice(1);
  }
  if (value.length === 0) {
    return { ok: false, error: { kind: "empty" } };
  }
  if (!DOMAIN_REGEX.test(value)) {
    return { ok: false, error: { kind: "invalid_format" } };
  }
  if (FREE_EMAIL_DOMAINS.has(value)) {
    return { ok: false, error: { kind: "free_email", domain: value } };
  }
  return { ok: true, domain: value };
}
