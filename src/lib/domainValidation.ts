/**
 * クライアント側からのドメイン入力検証 (`note_domain_access`, issue #663) の入口。
 * 真実の値は `@zedi/shared/freeEmailDomains` に集約されている。
 *
 * Client-side entry point for domain-input validation used by the
 * `note_domain_access` flow (issue #663). The canonical values live in
 * `@zedi/shared/freeEmailDomains`.
 */
export {
  DOMAIN_REGEX,
  FREE_EMAIL_DOMAINS,
  normalizeDomainInput,
  type DomainValidationError,
  type DomainValidationResult,
} from "@zedi/shared/freeEmailDomains";
