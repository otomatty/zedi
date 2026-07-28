# CI/CD Pipeline — api-worker

前提: performance-design.md（検証設計）・logical-components.md（LC-5/LC-6）を CI に落とす。application-design / business-logic-model.md は infra スコープにより不在。

## 既存（不変）

- `ci.yml`: `api-typecheck` / `api-test` ジョブ（bun install --frozen-lockfile → typecheck / vitest）。
- `deploy-api-worker-dev.yml`: `develop` push（paths: `server/api/**`）→ `wrangler deploy --env dev` + `curl --fail` health-poll（`WORKER_API_BASE_URL` 未設定時スキップ）。**CI の Cloudflare トークンは要修復（C-2）— 本 Issue ではワークフロー定義を変更せず、実デプロイ検証は資格情報復旧後。**

## 追加（本 Issue）

| 追加 | 実行場所 | 内容 |
|------|---------|------|
| `worker:bundle:check` script | `ci.yml` の api 系ジョブに 1 ステップ追加、**かつ `deploy-api-worker-dev.yml` の deploy 直前にも同ステップを置く**（ci.yml とは並列起動のため、デプロイ前実行を機械的に保証するのは deploy ジョブ内のステップ） | LC-5: `wrangler deploy --dry-run --outdir` 出力に `@langchain` / `src/agents` / `@hono/node-server` / `@sentry/node` が**不在**なことを fail-fast 検査。資格情報不要 |
| `test:worker` script | 同上（`api-test` に追加 or 併設ステップ） | LC-6: workerd テスト（vitest-pool-workers。互換フォールバックは code-generation で決定） |

## 作らないもの

- prod 用デプロイワークフロー（Q8=B — 切替判断時の別 PR）。
- `wrangler versions upload` による PR プレビュー（migration-plan の将来項目。本 Issue では見送り）。
