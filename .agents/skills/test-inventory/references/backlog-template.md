# 出力テンプレート / Output Templates

Phase 5 でこの形式を使う。Markdown としてチャットに出力する。

---

## project-profile

```yaml
# project-profile — spec-test Phase 0 に引き継ぐ
project_profile:
  repo_root: "."
  scope: "src/lib"
  test_runner: vitest
  package_manager: bun
  test_run_command: "bunx vitest run"
  coverage_command: "bun run test:coverage"
  test_layout: colocated
  setup_files:
    - "vitest.setup.ts"
  example_test_paths:
    - "src/lib/foo.test.ts"
  mutation: stryker
  mutation_command: "bun run test:mutation:changed"
  mutation_threshold_high: 85
  e2e_runner: playwright
  bootstrap_needed: false
  overlay: null
  verification_level: A
  open_questions: []
```

---

## test-backlog

```markdown
# test-backlog

生成日: YYYY-MM-DD
スコープ: `src/lib`
テストファイル数: 3 / ソースファイル数: 47
bootstrap_needed: false

## Summary

- P0: 2 件 — 純関数・バリデーションから着手推奨
- P1: 5 件
- OPEN QUESTION: 1 件（test_layout が mixed）

## Prioritized Targets

| Priority | Path                        | Layer | Risk | Ease | Rationale          | Has test? |
| -------- | --------------------------- | ----- | ---- | ---- | ------------------ | --------- |
| P0       | src/lib/validateEmail.ts    | pure  | 45   | 85   | 入力検証、I/O なし | no        |
| P0       | src/lib/clampLimit.ts       | pure  | 40   | 80   | 数値境界           | no        |
| P1       | src/services/userService.ts | unit  | 70   | 55   | 認可 + DB 境界     | no        |

## Detail — P0

### src/lib/validateEmail.ts

- **suggested_first_cases**: 空文字、@ なし、正常、国際化ドメイン
- **spec-test 引数**: `src/lib/validateEmail.ts`
- **配置先（推定）**: `src/lib/validateEmail.test.ts`

### src/lib/clampLimit.ts

- **suggested_first_cases**: 下限−1、下限、上限、上限+1
- **spec-test 引数**: `src/lib/clampLimit.ts`

## Dedupe notes

（該当なし）

## Next steps

1. P0 `src/lib/validateEmail.ts` で `spec-test` を実行（上記 project-profile を渡す）
2. 完了後 P0 次項目 → P1 へ
3. bootstrap_needed: true の場合は先に bootstrap テンプレ適用とユーザー承認
```
