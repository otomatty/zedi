# Project-Level Rules

> Project-specific overrides and corrections. Overrides aidlc-team.md
> and aidlc-org.md. Populated by practices-discovery and the
> self-learning loop.
>
> Use sparingly: most teams don't need a project layer. Reach for it
> only when this specific project deviates from team-wide practice in a
> stable, durable way (e.g., "this monorepo project rebases even though
> our team default is squash"; "this legacy project skips the test
> floor because the existing suite is unsalvageable and we accept
> that").

## Way of Working

<!-- Project-specific override. Example: -->
<!-- This monorepo project rebases instead of squash-merging because -->
<!-- the per-package commit history is the audit trail we depend on -->
<!-- for partial-rollback decisions. Override applies to this project -->
<!-- only. -->

## Walking Skeleton

<!-- Project-specific override. Example: -->
<!-- This project skips the walking skeleton because we're rewriting -->
<!-- an existing service in-place — there's no greenfield bootstrap -->
<!-- to gate. -->

## Testing Posture

<!-- Project-specific override. -->

## Deployment

<!-- Project-specific override. -->

## Code Style

<!-- Project-specific override. -->

## Tech Stack

<!-- Technology choices locked for this project. -->

## Decided

<!-- Decisions made in earlier stages that should not be re-asked. -->
<!-- Format: DECIDED: [decision] (Stage [slug], [date]) -->

## Scope Overrides

<!-- Custom scope rules for this project. -->

## Forbidden

<!-- Populated by practices-discovery affirmation gate. -->
<!-- Format: NEVER [behavior] (affirmed [date]) -->
<!-- Example: NEVER throw exceptions across service layer boundaries (affirmed 2026-05-17) -->

- NEVER add colocated test files in `server/api` or `server/mcp` — tests mirror the source tree under `src/__tests__/`. (affirmed 2026-07-18)
- NEVER write "写し絵テスト" (tests copied from implementation output) or rewrite expectations to match a failing implementation without justification. (affirmed 2026-07-18)
- NEVER use kebab-case for domain directories (exception: `packages/ui/src/components/` shadcn files). (affirmed 2026-07-18)
- NEVER place non-hook modules in `src/hooks/` or hooks in `src/pages/`. (affirmed 2026-07-18)
- NEVER let 5xx responses leak raw internal/DB error messages — all errors flow through the global `onError` `{ error: string }` envelope. (affirmed 2026-07-18)
- NEVER commit secret values (`.env*` real files stay gitignored; `.gitleaksignore` tracks false positives only). (affirmed 2026-07-18)
- NEVER apply SQL migrations outside `server/api/drizzle/` — other SQL locations do not reach production. (affirmed 2026-07-18)
## Mandated

<!-- Populated by practices-discovery affirmation gate. -->
<!-- Format: ALWAYS [behavior] (affirmed [date]) -->
<!-- Example: ALWAYS use Result<T,E> for fallible operations in service layer (affirmed 2026-05-17) -->

- ALWAYS follow TDD Red → Green → Refactor: write a failing test before any implementation change. (affirmed 2026-07-18)
- ALWAYS start Construction with a walking skeleton — the thinnest end-to-end slice proving every integration point — before building out the rest. (affirmed 2026-07-18)
- ALWAYS pair `server/api/src/schema/**/*.ts` changes with a `server/api/drizzle/NNNN_*.sql` migration and a `drizzle/meta/_journal.json` entry in the same PR. (affirmed 2026-07-18)
- ALWAYS use a merge commit (never squash) when syncing `main` → `develop`. (affirmed 2026-07-18)
- ALWAYS update `packages/shared` and the corresponding `server/*` duplicated constants together; the drift test must stay green. (affirmed 2026-07-18)
- ALWAYS treat each service's `wrangler.jsonc` as the source of truth for Cloudflare configuration (not Terraform). (affirmed 2026-07-18)
- ALWAYS use Conventional Commits for PR titles. (affirmed 2026-07-18)
- ALWAYS manage secrets via `wrangler secret bulk` (`server/api/scripts/putWorkerSecrets.ts`) or GitHub Actions encrypted secrets. (affirmed 2026-07-18)
## Corrections

<!-- Project-specific corrections from human feedback. -->
<!-- Format: NEVER/ALWAYS [behavior] (learned [date]) -->

## AI-DLC Execution Notes
- infra scope skips reverse-engineering, so practices-discovery evidence scans run directly against the repo (AGENTS.md, CI configs, git history); do not expect reverse-engineering artifacts as inputs. (learned 2026-07-18) <!-- cid:practices-discovery:c1 -->
- aidlc-log.ts answer's human-turn guard rejects answers collected via the harness AskUserQuestion tool; the stage questions file is the authoritative answer record, and QUESTION_ANSWERED audit rows may be absent for interactively answered stages. (learned 2026-07-18) <!-- cid:practices-discovery:c2 -->

- This intent has a single unit named api-worker: all per-unit Construction stages (nfr-design, infrastructure-design, code-generation) write artifacts under construction/api-worker/<stage>/ using that same unit name. (learned 2026-07-18) <!-- cid:nfr-requirements:c1 -->
- Construction stages that provision no new resources and whose decisions all trace to approved upstream artifacts may run with a zero-question file stating that rationale; verify real config (e.g. wrangler.jsonc) directly instead of asking. (learned 2026-07-18) <!-- cid:infrastructure-design:c1 -->
## Issue 1091 Scope Decisions
- #1091 DoD is refined to Worker runtime compatibility + dev verification of non-DB routes only; DB-dependent routes (auth success flows included) are verified after #1090 (D1 big-bang). No Hyperdrive/Postgres-from-Workers work. (learned 2026-07-18) <!-- cid:requirements-analysis:c1 -->
- Where the #1091 issue body and inception/requirements-analysis/requirements.md diverge (pg/Hyperdrive, LangGraph body, prod cutover moved out of scope), requirements.md is authoritative. (learned 2026-07-18) <!-- cid:requirements-analysis:c2 -->

## Cloudflare Workers Bundle Boundaries
- Worker bundle exclusion must use module-level boundaries (separate module + entry-side wiring, e.g. appAgents.ts / clientIpNode.ts / sentryWorker.ts), never runtime flags or dynamic imports — wrangler's esbuild single-file bundle pulls dynamic imports in too. Applies equally to #1092 (server/mcp Workers migration). (learned 2026-07-18) <!-- cid:nfr-design:c2 -->
- Workers-side Sentry uses the @sentry/cloudflare withSentry wrapper on the default export (guarantees init + ctx.waitUntil event flush); plain captureException without the wrapper can lose events at request end. (learned 2026-07-18) <!-- cid:nfr-design:c3 -->
- Runtime discrimination (Workers vs Node) uses a dedicated RUNTIME var in wrangler.jsonc, never ENVIRONMENT — ENVIRONMENT distinguishes dev/prod and also exists on Railway, so it cannot tell runtimes apart. Security-sensitive branches (CF-Connecting-IP trust) must gate on this explicit signal. (learned 2026-07-18) <!-- cid:infrastructure-design:c2 -->
