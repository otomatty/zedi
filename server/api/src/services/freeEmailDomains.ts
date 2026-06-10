/**
 * 無料メール (free-webmail) プロバイダのドメイン拒否リストと、`note_domain_access`
 * のドメイン入力を正規化・検証するユーティリティ。
 *
 * ドメイン招待 (#663) は「社内 OSS / WG」など閉じた組織のメールドメインを
 * 対象にする機能なので、Gmail / Outlook / Yahoo といった「誰でも取得できる」
 * フリーメールを許可すると、事実上 `unlisted` と区別がつかなくなる。ここでは
 * ハードコードされた拒否リストで代表的なものだけ弾き、将来は DNS TXT による
 * 所有権検証 (`verifiedAt`) に進化させる前提の最低限のガード。
 *
 * 同期義務 / Sync obligation:
 * - `packages/shared/src/freeEmailDomains.ts` が真実の値。`server/api` は
 *   ワークスペース外なので `@zedi/shared` を直接 import できず、本ファイルで
 *   同じ値を二重定義している。`src/lib/freeEmailDomainsSync.test.ts` が
 *   両者の `FREE_EMAIL_DOMAINS` / `DOMAIN_REGEX` の一致を CI で担保する。
 * - 本ファイルを編集したら `packages/shared/src/freeEmailDomains.ts` も
 *   同じ値で更新すること。ドリフト検知テストが失敗したら片側しか更新して
 *   いないので、もう片方を揃える。
 *
 * Deny-list of free-webmail providers, plus helpers to normalise and validate
 * domain inputs for `note_domain_access` (issue #663).
 *
 * Domain-scoped invitations are meant for closed organisational domains
 * (company, working group). Allowing free-mail providers would essentially
 * collapse this feature into `unlisted`, since anyone can mint an address at
 * those hosts. This module hard-codes the most common ones as a v1 safeguard;
 * a future v2 will add DNS-TXT ownership verification via `verifiedAt`.
 *
 * Sync obligation: the canonical copy lives in
 * `packages/shared/src/freeEmailDomains.ts`. `server/api` cannot import
 * `@zedi/shared` because it lives outside the workspace, so this file
 * duplicates the values; `src/lib/freeEmailDomainsSync.test.ts` enforces
 * equality between the two sides in CI. Update both files together.
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
 * `DomainValidationError` は {@link normalizeDomainInput} が返すエラーを分類する
 * 判別共用体。ルート側で HTTP ステータスやユーザー向けメッセージにマップする。
 *
 * Discriminated error kinds returned by {@link normalizeDomainInput}. Routes
 * map them to HTTP status codes and user-facing messages.
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
const DOMAIN_REGEX = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/;

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

/**
 * メールアドレスからドメイン部（小文字・`@` なし）を取り出す。
 * 解析できなければ `null`。呼び出し側で「マッチするドメインルールがあるか」を
 * 調べる用途を想定している。
 *
 * Extract the lower-cased, `@`-less domain part of an email address, or
 * `null` when the input is not a plausible address. Callers use this to look
 * up matching domain-access rules.
 */
export function extractEmailDomain(email: string | undefined | null): string | null {
  if (typeof email !== "string") return null;
  const atIndex = email.lastIndexOf("@");
  if (atIndex <= 0 || atIndex === email.length - 1) return null;
  const domain = email
    .slice(atIndex + 1)
    .trim()
    .toLowerCase();
  if (domain.length === 0) return null;
  return domain;
}
