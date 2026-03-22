---
name: stryker-mutation-diff
description: >
  Runs Stryker mutation tests only on git-changed production files under `src/`
  via `scripts/stryker-mutate-changed.mjs` and `bun run test:mutation:changed`.
  Uses `stryker.config.mutation-changed.mjs` so partial runs do not fail on global
  `thresholds.break`.   Use when the user asks for mutation testing on changed files
  only, incremental mutation test, diff-based Stryker, or "差分だけミューテーション" /
  "mutation test for current changes". After a run, use `bun run mutation:report:summary`
  and attach `reports/mutation/mutation-summary.md` for AI explanation (not HTML).
---

# Stryker mutation test (diff / changed files only)

Full-repo mutation (`bun run test:mutation`) mutates thousands of mutants and is slow. For **local or branch-scoped runs**, use the **changed-file** workflow below.

## Prerequisites

- Repository root: `zedi` (frontend Stryker config: `stryker.config.mjs`, Vitest).
- **Scope**: only `src/**/*.ts(x)` excluding `*.test.*`, `*.spec.*`, `__tests__`. **`server/api` is not mutated** (different test setup; use `cd server/api && bun run test:run` for API tests).

## Config vs full-repo mutation

- **`bun run test:mutation`** uses `stryker.config.mjs` (includes `thresholds.break`, e.g. 70%).
- **`bun run test:mutation:changed`** uses **`stryker.config.mutation-changed.mjs`**, which is the same settings except **`thresholds.break` is `null`**. Reason: partial `--mutate` runs often produce a **low global score** and many **`# no cov`** mutants that do **not** mean the same thing as a full-repo score; failing the process on CI-style thresholds is usually misleading for diff-only runs.

## Primary command (automated file list)

Collects paths from git, joins them as a single `--mutate` argument (comma-separated), and invokes the local `@stryker-mutator/core` CLI.

```bash
# Working tree vs HEAD (staged + unstaged + untracked under src/)
bun run test:mutation:changed

# Recommended for slow machines / first failure: extend initial test run timeout (default is 5 minutes)
bun run test:mutation:changed -- --dryRunTimeoutMinutes 30

# Optional: ignore static mutants (often much faster)
bun run test:mutation:changed -- --ignoreStatic

# Dry-run only (initial test run + coverage; no mutants executed)
bun run test:mutation:changed -- --dryRunOnly
```

### Compare against a base branch (e.g. PR scope)

Uses `git diff <base>...HEAD --name-only` instead of working-tree diffs.

```bash
STRYKER_DIFF_BASE=develop bun run test:mutation:changed
```

On Windows PowerShell: `$env:STRYKER_DIFF_BASE="develop"; bun run test:mutation:changed`

## Troubleshooting (symptom → action)

| Symptom                                                  | Likely cause                                                                            | Action                                                                                                       |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `Initial test run timed out`                             | Default dry-run limit is **5 minutes**; Vitest + `perTest` coverage can exceed it.      | Retry with `--dryRunTimeoutMinutes 15` or `30`.                                                              |
| `There were failed tests in the initial test run`        | Unit tests fail under Stryker.                                                          | Fix tests: `bun run test:run` until green.                                                                   |
| `No changed files under src/`                            | Only tests / `server/` / non-`src` changed, or nothing to diff.                         | Ensure production files under `src/` exist; use `STRYKER_DIFF_BASE` for branch scope.                        |
| Low `% Mutation score` / many `# no cov` on changed runs | **Expected** for scoped `--mutate`: many mutants are not mapped to a test in this mode. | Use the report to **review survivors**; do not compare the number to full-repo `test:mutation` expectations. |
| Run is very slow                                         | Many mutants + `perTest` coverage.                                                      | Try `--ignoreStatic`; reduce scope (fewer files); use `--dryRunOnly` to validate setup first.                |

## Reading the report

- **Do not load `mutation.html` in chat** — it embeds megabytes of JS/data and wastes context.
- **Machine-readable JSON**: `reports/mutation/mutation.json` (from the `json` reporter in `stryker.config.mjs`).
- **Compact summary for AI** (recommended): after any mutation run, generate Markdown and attach it with `@`:

```bash
bun run mutation:report:summary
# → reports/mutation/mutation-summary.md
```

Optional: `STRYKER_SUMMARY_MAX_SURVIVED=120` (default 80), `STRYKER_SUMMARY_OUT=path/to/out.md`.

- **HTML** (browser only): `reports/mutation/mutation.html` — use locally; not for AI context.
- **Column meanings**: `# killed` = tests caught the mutation; `# survived` = weakness to address; `# no cov` = no test matched in this run (often high on partial `--mutate`).

## If the script reports no files

- Ensure there are changed **production** files under `src/` (not only tests or `server/`).
- For branch-only mode, set `STRYKER_DIFF_BASE` or commit changes so `git diff HEAD` lists files.

## Manual invocation (explicit files)

When the agent or user already knows the exact paths:

```bash
bunx stryker run --mutate "src/lib/foo.ts,src/hooks/bar.ts" --dryRunOnly stryker.config.mutation-changed.mjs
```

For full-repo thresholds, use `stryker.config.mjs` instead.

## Implementation reference

- Script: [`scripts/stryker-mutate-changed.mjs`](../../../scripts/stryker-mutate-changed.mjs)
- Summary generator: [`scripts/stryker-mutation-report-summarize.mjs`](../../../scripts/stryker-mutation-report-summarize.mjs)
- Changed-file config: [`stryker.config.mutation-changed.mjs`](../../../stryker.config.mutation-changed.mjs)
- Package scripts: `test:mutation:changed`, `mutation:report:summary` in root [`package.json`](../../../package.json)

## Agent checklist

1. Prefer `bun run test:mutation:changed` over editing `stryker.config.mjs` `mutate` globs for one-off runs.
2. On **timeout** during initial test run, retry with `--dryRunTimeoutMinutes 30` before other changes.
3. Pass through extra Stryker flags after `--`: e.g. `-- --ignoreStatic --timeoutMS 120000`.
4. Do not claim mutation coverage for `server/api` from this skill; point to Vitest under `server/api` instead.
5. If the initial dry run fails with **failed tests** (not timeout), fix unit tests first (`bun run test:run`); Stryker aborts when the unmutated suite fails.
6. Do **not** treat a low mutation score on `test:mutation:changed` as a CI gate failure; use **`bun run test:mutation`** for repo-wide thresholds.
7. To **explain results to the user**, run **`bun run mutation:report:summary`** and read **`reports/mutation/mutation-summary.md`** — never read `mutation.html` into context.
8. For deeper debugging: `stryker run --fileLogLevel trace --logLevel debug` (see [Stryker troubleshooting](https://stryker-mutator.io/docs/stryker-js/troubleshooting/)).
