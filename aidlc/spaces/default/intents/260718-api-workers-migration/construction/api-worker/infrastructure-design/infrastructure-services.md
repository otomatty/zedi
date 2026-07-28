# Infrastructure Services — api-worker

前提: logical-components.md（LC-1〜6）・security-design.md・reliability-design.md の要求をサービス面に落とす。application-design / business-logic-model.md は infra スコープにより不在。

## 使用サービス（すべて既存 — 新規プロビジョニングなし）

| サービス | リソース | 状態 | 用途 |
|---------|---------|------|------|
| Workers | `zedi-api-dev` | 作成済み（deploy-api-worker-dev.yml がデプロイ中） | dev 検証 |
| R2 | `zedi-storage-dev` / `zedi-storage-prod` | 作成済み（#1089） | メディア・サムネ・PDF |
| Durable Objects | `KvDurableObject`（SQLite classes, migration v1） | 定義済み（#1093/#1118） | レート制限 / ワンタイムコード / deny-list |
| Secrets (Worker) | `wrangler secret bulk`（putWorkerSecrets.ts） | 仕組み導入済み（#1089） | BETTER_AUTH_SECRET, SENTRY_DSN_API, STORAGE_*（presign 用） |

## 変更点（本 Issue）

- `wrangler.jsonc` に `RUNTIME` var を追加（deployment-architecture.md 参照）。
- Worker secrets に `SENTRY_DSN_API` を追加登録（`.env.worker.*.example` に鍵名を追記。値は非コミット — SR-4）。
- **登録しないもの**: `DATABASE_URL`（D1 直行方針により Worker には不要 — TS-3。`REDIS_URL` も不要のまま、#1093 済）。

## 明示的に作らないもの

- Hyperdrive 設定（TS-3 で不採用）。
- D1 データベース（#1090）。
- prod Worker への route / custom_domain（Out of Scope）。
- Terraform リソース（凍結中、C-3）。
