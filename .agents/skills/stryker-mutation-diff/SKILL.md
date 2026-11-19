---
name: stryker-mutation-diff
description: >
  Run Stryker on changed files under app/src/ to verify how well the unit tests detect changes.
  List eligible files, run the changed-file mutation tests, and review the Markdown report for
  Survived and NoCoverage mutants.
---

# Stryker mutation tests for changed app files

Use this skill after changing files under `app/src/` to check whether the unit tests detect changes in behavior. Zedi no longer runs mutation tests for the root `src/`.

## Run the changed-file tests

1. From the repository root, enter `app/` and list the changed files eligible for mutation testing.

   ```bash
   cd app
   bun run test:mutation:changed:list
   ```

2. Run mutation tests for those files. The command exits successfully without running Stryker if there are no eligible changes.

   ```bash
   bun run test:mutation:changed
   ```

   To use the branch diff against `main`, set `STRYKER_DIFF_BASE=main` for both the list and the run. In Bash, prefix each command with the assignment.

   ```bash
   STRYKER_DIFF_BASE=main bun run test:mutation:changed:list
   STRYKER_DIFF_BASE=main bun run test:mutation:changed
   ```

   In Windows PowerShell, from `app/`:

   ```powershell
   $env:STRYKER_DIFF_BASE = 'main'; bun run test:mutation:changed:list; bun run test:mutation:changed; Remove-Item Env:STRYKER_DIFF_BASE
   ```

3. After a run produces a report, read its Markdown summary.

   ```bash
   bun run mutation:report:summary -- --stdout-only
   ```

4. Review `Survived` mutants for missing assertions and `NoCoverage` mutants for behaviors the unit tests never exercise. Add tests or strengthen assertions, then rerun the changed-file tests. If all mutants in a new file show `NoCoverage`, add unit tests or add the file to `INTEGRATION_ONLY`.

## Scope and reports

- Stryker targets `.ts` and `.tsx` files under `app/src/`, excluding tests, type declarations, `src/worker/integration/` (relative to `app/`), and files listed in `INTEGRATION_ONLY`.
- Stryker evaluates mutants using only the Node and happy-dom unit tests configured in `app/vitest.config.ts`. The workerd integration tests (`*.worker.test.ts`) cannot evaluate mutants.
- `INTEGRATION_ONLY` lists files the unit tests do not load. Verify those files with workerd integration tests or browser smoke tests, and use coverage and strong assertions to check test strength. Remove a file from the list when unit tests cover it.
- The score does not fail the run (`thresholds.break: null`). Stryker uses 85 and 75 as its high and low display thresholds. Per-file thresholds have yet to be set. The full run on 2026-11-19, with 81 files before the exclusions, scored about 77% among mutants for which tests ran.
- Reports are under `app/reports/mutation/`. The summary reads `mutation.json`. Set `STRYKER_HTML_REPORT=1` to enable the optional HTML report.

## References

- [Stryker configuration](../../../app/stryker.config.mjs)
- [Target selection and exclusions](../../../app/scripts/mutation/targets.mjs)
- [Changed-file runner](../../../app/scripts/mutation/runChanged.mjs)
- [Markdown report summarizer](../../../app/scripts/mutation/summarize.mjs)
