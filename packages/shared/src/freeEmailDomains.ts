/**
 * `note_domain_access` (#663) のドメイン入力で参照する、フリーメール (free-webmail)
 * プロバイダの拒否リストとドメイン文字列の正規化ユーティリティ。
 *
 * ドメイン招待は社内 OSS / WG など閉じた組織のメールドメインを対象とした機能なので、
 * 誰でも取得できる Gmail / Outlook / Yahoo 等のドメインを許可してしまうと事実上
 * `unlisted` と区別がつかなくなる。本ファイルが「真実の値」となり、`server/api`
 * 側が同じ値を二重定義し、`src/lib/freeEmailDomainsSync.test.ts` が CI で同期を担保する。
 *
 * Source-of-truth deny-list of free-webmail providers + domain-input
 * validation helpers used by the `note_domain_access` flow (#663). Domain
 * invitations are intended for closed organisational domains, so allowing
 * "anyone can register" providers (Gmail, Outlook, Yahoo, …) would collapse
 * the feature into `unlisted`. This file owns the canonical values; the
 * `server/api` package duplicates them in its own copy because it lives
 * outside the workspace, and `src/lib/freeEmailDomainsSync.test.ts` keeps
 * the two in sync via a CI drift detector.
 *
 * 同期義務 / Sync obligation:
 * - 本ファイルを編集したら `server/api/src/lib/freeEmailDomains.ts` も同じ値で更新する。
 *   ドリフト検知テストが失敗したらどちらか片側しか更新していないので、もう片方を揃える。
 * - When this file changes, also update
 *   `server/api/src/lib/freeEmailDomains.ts`. If the drift test fails, only
 *   one side was edited — sync the other.
 */

/**
 * 拒否対象の無料メールドメイン（小文字・`@` なし）。
 * 追加する際は小文字で、かつ意味的に「個人が誰でも取得できる」サービスに限定する。
 *
 * Free-webmail domains we block for domain-scoped access rules. Entries must
 * be lower-case and only cover providers where anyone can register an address.
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
 * `DomainValidationError` は {@link normalizeDomainInput} が返すエラーを分類する判別共用体。
 * 呼び出し側は HTTP ステータスやユーザー向けメッセージにマップする。
 *
 * Discriminated error kinds returned by {@link normalizeDomainInput}. Callers
 * map them to HTTP status codes or user-facing messages.
 */
export type DomainValidationError =
  | { kind: "empty" }
  | { kind: "invalid_format" }
  | { kind: "free_email"; domain: string };

/**
 * ドメイン入力を正規化した結果。成功時は小文字・`@` 無しのドメイン文字列、
 * 失敗時は {@link DomainValidationError}。
 *
 * Result of normalising a domain input: either a lower-cased, `@`-less domain
 * string or a {@link DomainValidationError}.
 */
export type DomainValidationResult =
  | { ok: true; domain: string }
  | { ok: false; error: DomainValidationError };

/**
 * RFC 1035 ベースのラフなドメイン検証。IDN / punycode は将来対応。
 * `example.com` / `a.b-c.example.jp` など、ラベルは英数字とハイフン、各ラベル
 * 1..63 文字、全体 1..253 文字、TLD はアルファベットで 2 文字以上。
 *
 * Lightweight RFC 1035 domain check (IDN / punycode left for a later pass).
 * Each label is alphanumeric plus hyphen, 1..63 chars; the whole name must be
 * 1..253 chars; the TLD must be alphabetic and at least 2 characters.
 */
export const DOMAIN_REGEX = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/;

/**
 * ユーザー/API 入力のドメイン文字列を正規化する。
 *
 * - 前後空白を除去し小文字化
 * - 先頭 `@` を 1 つだけ除去（`@example.com` 形式の入力を救済）
 * - 空文字・形式不正・フリーメールドメインを拒否
 *
 * Normalise a raw domain input:
 * - trim & lower-case
 * - strip a single leading `@`
 * - reject empty strings, malformed domains, and free-webmail providers.
 *
 * @param raw - ユーザーから受け取った生の文字列 / Raw user input
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
