# Zedi overlay / Zedi オーバーレイ

Rules merged by spec-test / test-inventory when `project_profile.overlay: zedi`.
`project_profile.overlay: zedi` のとき spec-test / test-inventory がマージする規約。

## Detection / 検出

- Repository root contains `AGENTS.md` and `bun.lock` / `bun.lockb`, or set `overlay: zedi`
- リポジトリルートに `AGENTS.md` と `bun.lock` / `bun.lockb` がある、または `overlay: zedi` を指定

## test_placement

| スコープ                       | テスト配置                                                                              | 見本探索                     |
| ------------------------------ | --------------------------------------------------------------------------------------- | ---------------------------- |
| `src/`, `packages/*`, `admin/` | 実装と **同階層** colocated（`foo.test.ts`）                                            | 同ディレクトリの `*.test.ts` |
| `app/`                         | 実装と同階層。workerd 上の統合テストは `*.worker.test.ts`、Node 専用は `*.node.test.ts` | 同ディレクトリ               |
| E2E                            | `e2e/*.spec.ts`                                                                         | Playwright                   |

## コマンド（profile 未設定時のデフォルト）

| スコープ               | test_run_command                                                                        | coverage_command        |
| ---------------------- | --------------------------------------------------------------------------------------- | ----------------------- |
| ルート `src/`          | `bunx vitest run <path>`                                                                | `bun run test:coverage` |
| `admin` / `packages/*` | `bunx vitest run --config <ws>/vitest.config.ts <path>`                                 | 同左 + `--coverage`     |
| `app/`                 | `cd app && bunx vitest run <path>`（workerd 統合は `--config vitest.config.worker.ts`） | 同左 + `--coverage`     |
| E2E                    | `bunx playwright test <spec>`                                                           | —                       |

## Mutation

- フロント `src/` のみ: `bun run test:mutation:changed`
- スコープ確認: `node scripts/stryker-mutate-changed.mjs --list`
- `app/` は Stryker 対象外 → 該当スコープは `verification_level: B`（coverage + §5）

## モックヘルパー（example 探索キーワード）

- `app/` の API: `*.worker.test.ts`（`cloudflare:test` の `SELF.fetch`）
- フロント: 既存 test の `render` ラッパー

## ドキュメント

- TDD 方針: ルート `AGENTS.md`
- Mutation 差分実行: `.agents/skills/stryker-mutation-diff/SKILL.md` または `scripts/stryker-mutate-changed.mjs`

## コメント

export 関数・フックには日英併記 TSDoc/JSDoc（`AGENTS.md`）。テスト describe コメントも同様。
