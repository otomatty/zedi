# Quality Gates — api-worker (#1091)

前提: ci-config.md のワークフロー変更が守るべきゲート基準。code-generation / build-and-test 成果物は infra スコープにより不在（expected）。

## PR マージ要件（required status checks — GitHub 側構成済み、Q4=A）

| ゲート | 判定 | 根拠 |
|--------|------|------|
| `api-typecheck` + **bundle check** | `tsc --noEmit` green + 禁止依存（`@langchain` / `src/agents` / `@hono/node-server` / `@sentry/node`）が Worker バンドルに不在 | FR-1.2 / FR-2.3 / LC-4 |
| `api-test` + **test:worker** | 既存 vitest green（NFR-2: Node 側パリティ）+ workerd テスト green（FR-5.2 の対象全数） | TDD 必守（team-practices） |
| 既存 lint / knip / e2e 等 | 不変 | — |

## デプロイゲート（dev）

| ゲート | 判定 |
|--------|------|
| deploy 直前 bundle check | ci.yml と同一スクリプト。fail で deploy 中止 |
| health-poll | `curl --fail`（HTTP 成功判定、CI 自動）。`runtime` フィールド確認は手動 dev 検証（RL-5 帰属） |

## ゲートにしないもの（明示）

- カバレッジ閾値の機械強制（Q5=A: 80% は目標値。Mutation は server/api 対象外）。
- パフォーマンス数値（Q2=A: パリティ方針、PR-1）。
- prod 昇格ゲート（Out of Scope）。
