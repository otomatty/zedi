/**
 * クライアント側からのドメイン入力検証 (`note_domain_access`, issue #663) の入口。
 * 真実の値は `@zedi/shared/freeEmailDomains` に集約されており、サーバ側 (
 * `server/api/src/lib/freeEmailDomains.ts`) にも同じ値が二重定義されている。
 * 同期は `src/lib/freeEmailDomainsSync.test.ts` のドリフト検知テストで担保する。
 *
 * Client-side entry point for domain-input validation used by the
 * `note_domain_access` flow (issue #663). The canonical values live in
 * `@zedi/shared/freeEmailDomains`; `server/api` keeps a duplicate copy
 * because it lives outside the workspace, and
 * `src/lib/freeEmailDomainsSync.test.ts` enforces equality in CI.
 */
export {
  DOMAIN_REGEX,
  FREE_EMAIL_DOMAINS,
  normalizeDomainInput,
  type DomainValidationError,
  type DomainValidationResult,
} from "@zedi/shared/freeEmailDomains";
