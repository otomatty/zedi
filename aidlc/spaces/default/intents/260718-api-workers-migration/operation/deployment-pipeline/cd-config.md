# CD Config — api-worker (#1091)

前提: construction/ci-pipeline/ci-config.md・quality-gates.md と infrastructure-design の deployment-architecture.md・cicd-pipeline.md（unit: api-worker）を CD 面から確定する。

## デプロイパイプライン（dev のみ）

```
develop push (paths: server/api/**)
  -> deploy-api-worker-dev.yml
       1. bun install --frozen-lockfile
       2. bun run worker:bundle:check        <- 追加（デプロイ前の機械保証）
       3. wrangler deploy --env dev          <- 既存（GIT_COMMIT_SHA var 付与）
       4. curl --fail health-poll            <- 既存（WORKER_API_BASE_URL 設定時のみ）
```

<!-- Text fallback: develop への push で dev 用ワークフローが起動し、依存インストール、バンドル検査、wrangler deploy、ヘルスチェックの順で実行する。 -->

## 環境と資格情報

- 対象環境: `zedi-api-dev` のみ。production env は定義済みだがデプロイ経路を作らない（Q8=B）。
- CI 資格情報（`CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID`）は**要修復（C-2）**。修復までは workflow は起動しても deploy ステップで失敗し得る — bundle check / テストは資格情報不要のため PR 品質ゲートは機能し続ける。

## 変更しないもの

- Railway デプロイ（`src/index.ts`、本番トラフィック）— 不変（A-3）。
- `deploy-dev.yml` / `deploy-prod.yml`（フロント・DB migrate）— 本 Issue の対象外。
