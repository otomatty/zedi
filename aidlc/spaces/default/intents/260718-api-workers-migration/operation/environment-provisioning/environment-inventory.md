# Environment Inventory — api-worker (#1091)

前提: infrastructure-design/deployment-architecture.md・infrastructure-services.md（unit: api-worker）と deployment-pipeline/cd-config.md の環境要素を棚卸しする。構成の正本は `server/api/wrangler.jsonc`（実体確認済み）。

## dev 環境（本 Issue の検証対象）

| 要素 | 値 | 状態 | 出典 |
|------|-----|------|------|
| Worker | `zedi-api-dev` | デプロイ実績あり（deploy-api-worker-dev.yml） | wrangler.jsonc env.dev |
| R2 | `zedi-storage-dev`（binding `STORAGE_BUCKET`） | 作成済み（#1089） | wrangler.jsonc / migration-plan Phase 1 |
| DO | `KV_DO` → `KvDurableObject`（SQLite classes, migration v1） | 定義済み（#1093/#1118） | wrangler.jsonc |
| vars | `ENVIRONMENT=development`（既存）+ `RUNTIME=cloudflare-workers`（実装時追加） | 一部未追加 | deployment-architecture.md |
| secrets | `BETTER_AUTH_SECRET`, `STORAGE_*`（presign）+ `SENTRY_DSN_API`（実装時追加） | bulk 投入機構あり（putWorkerSecrets.ts） | infrastructure-services.md |

## production 環境（定義のみ — 本 Issue ではデプロイしない）

| 要素 | 値 | 状態 |
|------|-----|------|
| Worker | `zedi-api` | env 定義のみ。デプロイ経路なし（Q8=B） |
| R2 | `zedi-storage-prod` | 作成済み。Railway API が S3 互換エンドポイント経由で使用中 |

## アクセス経路と資格情報

| 経路 | 状態 |
|------|------|
| ローカル wrangler | **別アカウントにログイン中（要切替）** — C-2 |
| CI トークン（CLOUDFLARE_API_TOKEN） | **要修復** — C-2 |
| Cloudflare MCP（claude.ai connector） | 本セッション未認証 |

新規プロビジョニングは不要（作成すべき未作成リソースなし）。
