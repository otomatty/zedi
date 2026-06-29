# 移行フェーズ計画 / Migration phases

1 フェーズ = 1 PR を基本。各 PR で「実装 → MCP で状態確認 → health/SHA 検証」を回す。
出典: [Issue #1088](https://github.com/otomatty/zedi/issues/1088) のロードマップ。

## Phase 0: 基盤整備 / Foundation (コード影響ほぼ無し)

1. 本スキル（`.agents/skills/cloudflare-zedi/`）整備 → `bun run setup:agent-mirrors`。
2. 移行専用 API トークン作成（[token-scopes.md](token-scopes.md)）。
3. `wrangler whoami` と Cloudflare MCP の疎通確認。

- **検証**: MCP `workers_list` / `r2_buckets_list` が応答する。

## Phase 1: #1089 R2 (低リスク)

**方針**: R2 は S3 互換 API を持つため、Railway 上の現 API（`@aws-sdk/client-s3`）はコード変更
なしで R2 に向けられる。Worker の R2 バインディングは API の Workers 化（Phase 2 / #1091）まで
導入しない。Phase 1 は「S3 互換エンドポイント＋ env 切替」に限定する。

- バケット作成: `zedi-storage-dev` / `zedi-storage-prod`（作成済み。MCP `r2_bucket_create`）。
- R2 API トークン発行（ダッシュボード R2 → Manage R2 API Tokens。MCP では不可）。
- `STORAGE_ENDPOINT` / `STORAGE_ACCESS_KEY` / `STORAGE_SECRET_KEY` / `STORAGE_BUCKET_NAME` を
  Railway（dev/prod）に設定。`.env.example` に書式を記載済み。
- 既存オブジェクトの R2 への移送（必要なら `rclone` 等。ビッグバン前提なら新規のみでも可）。
- **検証**: MCP `r2_buckets_list`、dev で `/api/media` アップロード→取得→削除の E2E。

## Phase 2: server を Workers 化 (中リスク)

- #1091 api（Hono は Workers 互換、`nodejs_compat`）/ #1092 mcp / #1093 Redis→KV。
- 各 `wrangler.jsonc` に `env.dev` / `env.production`、Secrets は `wrangler secret put`。
- **検証**: `wrangler dev` ローカル → dev デプロイ → `/health` の `git_commit_sha` 一致。

## Phase 3: フロント/admin を Pages→Workers Static Assets (Terraform 廃止の本丸)

- 移行前に MCP `migrate_pages_to_workers_guide` を必ず読む。
- web/admin に `assets.directory` を持つ Worker 設定を追加、`routes` で `custom_domain: true`。
- dev で先行カットオーバー → prod。
- **検証**: dev ドメインが Worker 経由で配信され、DNS が自動生成されていること。

## Phase 4: #1090 D1+DO / #1094 Hocuspocus / #1095 LangGraph (高リスク・一体設計)

- ビッグバン・カットオーバー（デュアルライトしない）。
- Drizzle を SQLite 方言へ、DO で realtime、Workflows/Queues で LangGraph。
- `drizzle-migration-check` ガードを D1 用に更新。
- **検証**: MCP `d1_database_query`、DO 動作、observability でエラー率。

## Phase 5: Terraform / Railway 完全撤去 / Teardown

- `terraform/cloudflare/**` 削除、`terraform-cloudflare-{shared,dev,prod}.yml` 3 本削除。
- Terraform Cloud ワークスペース（shared/dev/prod）削除、`TF_API_TOKEN` Secret 整理。
- Railway サービス停止（api / hocuspocus / mcp）、Postgres / Redis 廃止。
- `README` / `AGENTS.md` のデプロイ章を Workers ベースへ改訂。
- **検証**: `main` push で Terraform 不在のまま全デプロイ完走。

## CI/CD（ハイブリッド）/ CI/CD design

現状維持: PR ゲート（`ci.yml`: lint / format / vitest / typecheck / `drizzle-migration-check`）、
`develop`→dev / `main`→prod 自動、prod の health + commit SHA 一致ゲート。

現状超え:

| 強化                            | 手段                                                             |
| ------------------------------- | ---------------------------------------------------------------- |
| PR プレビュー環境               | `wrangler versions upload` → preview URL を PR にコメント        |
| 段階デプロイ / 即時ロールバック | `wrangler versions deploy`（gradual %）/ `wrangler rollback`     |
| DB migration の D1 化           | `wrangler d1 migrations apply`（`drizzle-kit migrate` から置換） |
| デプロイ後の自動検証            | `cloudflare-observability` MCP / `wrangler tail` でエラー率確認  |

ワークフロー構成（案）:

- `ci.yml`: PR 品質ゲート（＋ `wrangler types` 検証を追加）
- `preview.yml`: PR で各 Worker を `versions upload`、preview URL を貼る
- `deploy-dev.yml`: `develop` push → `wrangler deploy --env dev` ＋ D1 dev migrate
- `deploy-prod.yml`: `main` push → D1 prod migrate → `wrangler deploy --env production` → health/SHA ゲート → 必要なら gradual rollout
- **削除**: `terraform-cloudflare-{shared,dev,prod}.yml`

## 削除されるもの / To be removed

```
terraform/cloudflare/**                          (全 25 ファイル)
.github/workflows/terraform-cloudflare-dev.yml
.github/workflows/terraform-cloudflare-prod.yml
.github/workflows/terraform-cloudflare-shared.yml
Terraform Cloud: cloudflare-shared / -dev / -prod ワークスペース
GitHub Secrets: TF_API_TOKEN
Railway: api / hocuspocus / mcp サービス、Postgres / Redis
```

## リスクと対策 / Risks

| リスク                           | 対策                                                                                 |
| -------------------------------- | ------------------------------------------------------------------------------------ |
| DNS カットオーバーのダウンタイム | dev 先行検証。低 TTL で切替、Worker 稼働確認後に旧 Railway CNAME 撤去                |
| Terraform 削除でドメイン設定喪失 | 削除は Phase 5（全 Worker 稼働後）。先に DNS を Wrangler 管理へ移してから state 破棄 |
| Pages→Workers の挙動差           | docs の compatibility matrix を確認。`_headers` / `_redirects` 差分を移行時に検証    |
