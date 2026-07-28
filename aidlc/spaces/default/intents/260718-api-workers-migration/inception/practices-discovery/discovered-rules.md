# Discovered Rules — Zedi

## Mandated

- ALWAYS follow TDD Red → Green → Refactor: write a failing test before any implementation change.
- ALWAYS start Construction with a walking skeleton — the thinnest end-to-end slice proving every integration point — before building out the rest.
- ALWAYS pair `server/api/src/schema/**/*.ts` changes with a `server/api/drizzle/NNNN_*.sql` migration and a `drizzle/meta/_journal.json` entry in the same PR.
- ALWAYS use a merge commit (never squash) when syncing `main` → `develop`.
- ALWAYS update `packages/shared` and the corresponding `server/*` duplicated constants together; the drift test must stay green.
- ALWAYS treat each service's `wrangler.jsonc` as the source of truth for Cloudflare configuration (not Terraform).
- ALWAYS use Conventional Commits for PR titles.
- ALWAYS manage secrets via `wrangler secret bulk` (`server/api/scripts/putWorkerSecrets.ts`) or GitHub Actions encrypted secrets.

## Forbidden

- NEVER add colocated test files in `server/api` or `server/mcp` — tests mirror the source tree under `src/__tests__/`.
- NEVER write "写し絵テスト" (tests copied from implementation output) or rewrite expectations to match a failing implementation without justification.
- NEVER use kebab-case for domain directories (exception: `packages/ui/src/components/` shadcn files).
- NEVER place non-hook modules in `src/hooks/` or hooks in `src/pages/`.
- NEVER let 5xx responses leak raw internal/DB error messages — all errors flow through the global `onError` `{ error: string }` envelope.
- NEVER commit secret values (`.env*` real files stay gitignored; `.gitleaksignore` tracks false positives only).
- NEVER apply SQL migrations outside `server/api/drizzle/` — other SQL locations do not reach production.
