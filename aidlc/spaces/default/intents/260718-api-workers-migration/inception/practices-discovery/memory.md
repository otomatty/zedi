<!-- INVARIANT: examples are single-line HTML comments so a fresh template parses to total=0 (MEMORY_EMPTY). Do NOT un-comment or split across lines. t100 guards this. -->
> This file is maintained by the orchestrator during stage execution. Add observations at the gate ritual, not by editing here directly.

## Interpretations
<!-- example: 2026-05-29T10:14:32Z — chose REST over GraphQL; the consuming team only needs CRUD, revisit if subscriptions land -->
- 2026-07-18T02:02:21Z — infra scope skips reverse-engineering, so brownfield evidence scan runs directly against the repo (AGENTS.md + configs + git history) instead of consuming reverse-engineering artifacts; consumes list was empty as expected.

## Deviations
<!-- example: 2026-05-29T10:14:32Z — skipped the optional caching layer the stage prose suggested; the dataset is small enough that it adds risk -->
- 2026-07-18T02:10:00Z — aidlc-log.ts answer refused to record ("a real human has not acted at this checkpoint this turn") because answers arrived via the harness AskUserQuestion tool, not a typed message; the questions file retains the full answers as the source of truth, so the QUESTION_ANSWERED audit rows are missing for this stage's interview.
- 2026-07-18T03:45:00Z — Claude Code harness lacked the UserPromptSubmit presence hook, so the typed approve minted no HUMAN_TURN and the gate refused; wired .claude/settings.json to run .codex/hooks/aidlc-mint-presence.ts and manually minted one presence event for the already-typed approve turn before committing the gate.

## Tradeoffs
<!-- example: 2026-05-29T10:14:32Z — picked TDD over BDD this run; the team is unit-first and the domain is well-understood -->

## Open questions
<!-- example: 2026-05-29T10:14:32Z — confirm the retention window with compliance before the next stage hardens the schema -->
