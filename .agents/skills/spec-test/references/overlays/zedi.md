# Zedi overlay

`project_profile.overlay: zedi` のとき spec-test / test-inventory がマージする規約。

## 検出

- リポジトリルートに `AGENTS.md` と `bun.lock` / `bun.lockb` がある
- またはユーザーが `overlay: zedi` を指定

## test_placement

| スコープ                       | テスト配置                                    | 見本探索                     |
| ------------------------------ | --------------------------------------------- | ---------------------------- |
| `src/`, `packages/*`, `admin/` | 実装と **同階層** colocated（`foo.test.ts`）  | 同ディレクトリの `*.test.ts` |
| `server/api`, `server/mcp`     | `src/__tests__/` 配下（ソースツリーをミラー） | `server/api/src/__tests__/`  |
| `server/hocuspocus`            | 実装と同階層                                  | 同ディレクトリ               |
| E2E                            | `e2e/*.spec.ts`                               | Playwright                   |

**禁止**: `server/api` / `server/mcp` に colocated テストを新規追加しない。

## コマンド（profile 未設定時のデフォルト）

| スコープ                                                    | test_run_command                                        | coverage_command        |
| ----------------------------------------------------------- | ------------------------------------------------------- | ----------------------- |
| ルート `src/`                                               | `bunx vitest run <path>`                                | `bun run test:coverage` |
| `server/api`                                                | `cd server/api && bunx vitest run <path>`               | 同左 + `--coverage`     |
| `server/hocuspocus` / `server/mcp` / `admin` / `packages/*` | `bunx vitest run --config <ws>/vitest.config.ts <path>` | 同左 + `--coverage`     |
| E2E                                                         | `bunx playwright test <spec>`                           | —                       |

## Mutation

- フロント `src/` のみ: `bun run test:mutation:changed`
- スコープ確認: `node scripts/stryker-mutate-changed.mjs --list`
- `server/api` は Stryker 対象外 → 該当スコープは `verification_level: B`（coverage + §5）

## モックヘルパー（example 探索キーワード）

- API ルート: `createTestApp`, `createMockDb`
- フロント: 既存 test の `render` ラッパー

## ドキュメント

- TDD 方針: ルート `AGENTS.md`
- Mutation 差分実行: `.agents/skills/stryker-mutation-diff/SKILL.md` または `scripts/stryker-mutate-changed.mjs`

## inventory P0 調整

Zedi では `packages/shared` と server 側定数のドリフト検知テスト（`*.sync.test.ts`）パターンがある。
新規定数追加時はペア更新が必要 → backlog に `sync test` メモを付ける。

## コメント

export 関数・フックには日英併記 TSDoc/JSDoc（`AGENTS.md`）。テスト describe コメントも同様。
