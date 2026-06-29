# Secrets / Bindings 一覧テンプレート / Secrets lifecycle template

移行フェーズ（[migration-plan.md](migration-plan.md)）ごとに **何を登録・削除してよいか** を追跡するための
チェックリスト。正本は `.env.example` と実装の `getEnv` / `process.env` 参照。
Worker への秘密値は **リポジトリに置かず** `wrangler secret put` で設定する。

_Secrets lifecycle checklist per migration phase. Source of truth = `.env.example` + code.
Never commit secret values; use `wrangler secret put` for Workers._

## 記号 / Legend

| 記号        | 意味                                                                                    |
| ----------- | --------------------------------------------------------------------------------------- |
| **Secret**  | `wrangler secret put` / Railway Variables / GitHub Encrypted Secret                     |
| **Binding** | `wrangler.jsonc` の `r2_buckets` / `kv_namespaces` / `d1_databases` / `durable_objects` |
| **Var**     | `wrangler.jsonc` の `vars`（平文可。CI が注入する `GIT_COMMIT_SHA` 等）                 |
| **—**       | 当フェーズでは触らない（前フェーズの設定を維持）                                        |

## 配置先の早見表 / Where secrets live

| 配置先                                                             | 用途                                      | 例                                               |
| ------------------------------------------------------------------ | ----------------------------------------- | ------------------------------------------------ |
| **Railway** (api / mcp / hocuspocus)                               | 現行本番・dev ランタイム                  | `DATABASE_URL`, `STORAGE_*`                      |
| **Worker secrets** (`wrangler secret put --env <dev\|production>`) | Cloudflare 上の API / MCP Worker          | Railway と同値をコピー（Phase 2b 以降）          |
| **GitHub Actions Secrets**                                         | CI デプロイ・Terraform（廃止予定）        | `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`  |
| **R2 API Token** (Cloudflare Dashboard)                            | S3 互換 presign / Railway S3 クライアント | `STORAGE_ACCESS_KEY` / `STORAGE_SECRET_KEY` の元 |

---

## マスター一覧（API Worker）/ Master inventory — `server/api`

### Bindings（`wrangler.jsonc`、秘密値ではない）

| Binding 名       | リソース                                    | Phase 導入 |
| ---------------- | ------------------------------------------- | ---------- |
| `STORAGE_BUCKET` | R2 `zedi-storage-dev` / `zedi-storage-prod` | 2a ✅      |
| `KV`（仮名）     | Redis 代替 KV namespace                     | 2b (#1093) |
| `DB`（仮名）     | D1 database                                 | 4 (#1090)  |
| DO bindings      | Hocuspocus / realtime                       | 4 (#1094)  |

### Vars（平文、`wrangler.jsonc` の `vars`）

| 名前             | 用途                                              | Phase |
| ---------------- | ------------------------------------------------- | ----- |
| `ENVIRONMENT`    | `development` / `production`                      | 2a ✅ |
| `GIT_COMMIT_SHA` | `/health` ロールアウト検証（CI が deploy 時注入） | 2b    |

### Secrets — 必須（Worker 本番切替前）

| 名前                                        | 用途                              | Railway → Worker                                |
| ------------------------------------------- | --------------------------------- | ----------------------------------------------- |
| `DATABASE_URL`                              | Postgres（Phase 4 まで）          | 同値コピー → Phase 4 で **削除**                |
| `BETTER_AUTH_SECRET`                        | セッション・署名                  | 同値（**必ず同一** — Hocuspocus / MCP と共有）  |
| `BETTER_AUTH_URL`                           | OAuth コールバック base           | Worker URL に更新（DNS 切替 PR で）             |
| `CORS_ORIGIN`                               | CSRF / trusted origins            | フロント URL（Phase 3 後に Workers ドメインへ） |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google OAuth                      | 同値                                            |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | GitHub OAuth                      | 同値                                            |
| `STORAGE_ENDPOINT`                          | R2 S3 互換 endpoint（presign 用） | 同値                                            |
| `STORAGE_ACCESS_KEY` / `STORAGE_SECRET_KEY` | R2 API token（presign 用）        | 同値（binding とは別 — presign に必要）         |
| `STORAGE_BUCKET_NAME`                       | バケット名                        | `zedi-storage-dev` / `zedi-storage-prod`        |
| `MCP_REDIRECT_URI_ALLOW`                    | MCP OAuth redirect 許可リスト     | 同値（未設定時 MCP は拒否）                     |

### Secrets — 機能別（未設定なら該当機能のみ無効）

| 名前                                                                      | 用途                                | 備考                                              |
| ------------------------------------------------------------------------- | ----------------------------------- | ------------------------------------------------- |
| `REDIS_URL`                                                               | レート制限・キャッシュ等            | Phase 2b まで Worker にも必要。**2b KV 後に削除** |
| `POLAR_ACCESS_TOKEN`                                                      | 課金 API                            |                                                   |
| `POLAR_WEBHOOK_SECRET`                                                    | Polar webhook 署名                  |                                                   |
| `POLAR_PRO_MONTHLY_PRODUCT_ID` / `POLAR_PRO_YEARLY_PRODUCT_ID`            | プラン ID                           | Var 化可（秘密ではない）                          |
| `RESEND_API_KEY` / `RESEND_FROM_EMAIL`                                    | メール送信                          | 未設定時 no-op                                    |
| `SENTRY_DSN_API`                                                          | Sentry 送信                         |                                                   |
| `SENTRY_WEBHOOK_SECRET`                                                   | Sentry webhook 署名                 |                                                   |
| `OPENAI_API_KEY` / `ANTHROPIC_API_KEY`                                    | システム LLM（BYOK 以外）           |                                                   |
| `OPENROUTER_API_KEY`                                                      | AI モデル料金 sync                  | 未設定時デフォルト cost                           |
| `USER_AI_CREDENTIALS_ENCRYPTION_KEY`                                      | BYOK 暗号化                         | 32 bytes base64/hex                               |
| `GITHUB_APP_ID` / `GITHUB_APP_PRIVATE_KEY` / `GITHUB_APP_INSTALLATION_ID` | Sentry→GitHub dispatch              |                                                   |
| `GITHUB_DISPATCH_REPOSITORY`                                              | dispatch 先 `owner/repo`            | 未設定時 dispatch スキップ                        |
| `MONITORING_NOTIFY_EMAIL` / `ADMIN_BASE_URL`                              | エラー通知メール                    |                                                   |
| `GOOGLE_CUSTOM_SEARCH_API_KEY` / `GOOGLE_CUSTOM_SEARCH_ENGINE_ID`         | サムネ画像検索                      |                                                   |
| `YOUTUBE_DATA_API_KEY`                                                    | クリップ / ext                      |                                                   |
| `SYNC_AI_MODELS_SECRET`                                                   | admin モデル sync                   |                                                   |
| `HOCUSPOCUS_INTERNAL_URL`                                                 | Y.js 無効化通知                     | Phase 4 まで Railway internal URL                 |
| `TRUST_PROXY`                                                             | `true` when behind CF/Railway proxy | Worker では通常 `true`                            |
| `EXTENSION_ORIGIN`                                                        | ブラウザ拡張 origin                 | 本番のみ                                          |

### Railway のみ（Worker では不要）

| 名前                     | 用途             | 削除タイミング                     |
| ------------------------ | ---------------- | ---------------------------------- |
| `PORT`                   | 待ち受けポート   | Phase 5 Railway 撤去               |
| `RAILWAY_GIT_COMMIT_SHA` | Railway 注入 SHA | Phase 5                            |
| `NODE_ENV`               | Node ランタイム  | Worker は `ENVIRONMENT` var を使用 |

---

## MCP Worker（`server/mcp`）/ Phase 2b (#1092)

| 名前                 | 種別         | 備考                                                                                                |
| -------------------- | ------------ | --------------------------------------------------------------------------------------------------- |
| `ZEDI_API_URL`       | Secret / Var | Worker 化後は **内部 URL**（例: `https://zedi-api-dev.<account>.workers.dev` または custom domain） |
| `BETTER_AUTH_SECRET` | Secret       | API と **同一値**                                                                                   |
| `PORT` / `MCP_HOST`  | —            | Workers では不要                                                                                    |

---

## GitHub Actions Secrets

| 名前                    | Phase | 操作                                                        |
| ----------------------- | ----- | ----------------------------------------------------------- |
| `CLOUDFLARE_API_TOKEN`  | 0〜   | **維持** — `wrangler deploy` / Pages deploy（Phase 3 まで） |
| `CLOUDFLARE_ACCOUNT_ID` | 0〜   | **維持**                                                    |
| `TF_API_TOKEN`          | 0〜4  | Phase 5 で **削除**（Terraform CI 廃止後）                  |

---

## フェーズ別 Δ / Per-phase register & remove

### Phase 0 — 基盤

| 操作     | 対象                                                                                      |
| -------- | ----------------------------------------------------------------------------------------- |
| **登録** | 移行用 Cloudflare API トークン（ローカル `CLOUDFLARE_API_TOKEN` または `wrangler login`） |
| **登録** | GitHub `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` が同一アカウントであることを確認  |
| **削除** | なし                                                                                      |

### Phase 1 — #1089 R2（Railway のみ）

| 操作                         | 対象                                                                                      |
| ---------------------------- | ----------------------------------------------------------------------------------------- |
| **登録（Railway dev/prod）** | `STORAGE_ENDPOINT`, `STORAGE_ACCESS_KEY`, `STORAGE_SECRET_KEY`, `STORAGE_BUCKET_NAME`     |
| **登録（Dashboard）**        | R2 バケット `zedi-storage-dev` / `zedi-storage-prod`、R2 API Token                        |
| **削除**                     | 旧 S3 互換ストレージの env（Railway から `STORAGE_*` を旧値から差し替え。キー自体は残す） |
| **Worker**                   | 触らない（Phase 2a まで Worker 未デプロイ or secrets 未設定でよい）                       |

### Phase 2a — #1091 Worker 骨格（実装済み）

| 操作                       | 対象                                                           |
| -------------------------- | -------------------------------------------------------------- |
| **登録（wrangler.jsonc）** | R2 binding `STORAGE_BUCKET` ✅                                 |
| **登録（GitHub Actions）** | `deploy-api-worker-dev.yml` が `CLOUDFLARE_*` を使用           |
| **登録（Worker secrets）** | **任意（dev E2E 前に必須）**: 上記マスター「必須」+ 利用機能分 |
| **削除**                   | なし（Railway は並行稼働）                                     |

```bash
# dev Worker secrets 設定例（server/api で実行）
cd server/api
bunx wrangler secret put DATABASE_URL --env dev
bunx wrangler secret put BETTER_AUTH_SECRET --env dev
# ... マスター一覧を参照
```

### Phase 2b — #1091 本番切替 + #1092 MCP + #1093 KV

| 操作                                        | 対象                                                                    |
| ------------------------------------------- | ----------------------------------------------------------------------- |
| **登録（wrangler.jsonc）**                  | KV namespace binding（#1093）                                           |
| **登録（Worker secrets dev + production）** | マスター「必須」+ Redis 利用機能があれば `REDIS_URL`（KV 移行完了まで） |
| **登録（vars / CI）**                       | `GIT_COMMIT_SHA` を deploy workflow で注入                              |
| **更新**                                    | `BETTER_AUTH_URL` → Worker custom domain（`api.zedi-note.app` 等）      |
| **更新**                                    | OAuth プロバイダの redirect URI を Worker URL に追加                    |
| **更新**                                    | Polar / Sentry webhook URL を Worker URL に                             |
| **登録（MCP Worker）**                      | `ZEDI_API_URL`, `BETTER_AUTH_SECRET`                                    |
| **削除（Worker secrets）**                  | `REDIS_URL` — KV binding + コード切替完了後                             |
| **削除（Railway）**                         | **まだしない** — DNS 切替・検証後 Phase 5                               |

### Phase 3 — フロント/admin Static Assets

| 操作                           | 対象                                                                            |
| ------------------------------ | ------------------------------------------------------------------------------- |
| **登録（GitHub Secrets）**     | 追加不要（既存 `CLOUDFLARE_*` で `wrangler deploy`）                            |
| **更新（API Worker secrets）** | `CORS_ORIGIN` — 新 Workers Static Assets の origin                              |
| **更新（OAuth）**              | Google/GitHub redirect に新フロント URL                                         |
| **削除（GitHub / Terraform）** | まだ Terraform Pages 関連は Phase 5 まで維持可                                  |
| **削除（Cloudflare Pages）**   | dev/prod カットオーバー検証後、Pages プロジェクト停止（Phase 5 と同 PR でも可） |

### Phase 4 — #1090 D1 + #1094 Hocuspocus + #1095 LangGraph

| 操作                           | 対象                                                          |
| ------------------------------ | ------------------------------------------------------------- |
| **登録（wrangler.jsonc）**     | D1 binding、DO bindings、Queues / Workflows 設定              |
| **登録（D1）**                 | 移行後 DB — `DATABASE_URL` の代わりに D1 binding              |
| **登録（Worker secrets）**     | D1 移行に必要な新 secrets（Workflows API 等、実装 PR で追記） |
| **削除（Worker secrets）**     | `DATABASE_URL` — D1 カットオーバー後                          |
| **削除（Worker secrets）**     | `HOCUSPOCUS_INTERNAL_URL` — DO 化後                           |
| **削除（Railway hocuspocus）** | Phase 5 まで猶予可                                            |

### Phase 5 — Terraform / Railway 完全撤去

| 操作                               | 対象                                                                 |
| ---------------------------------- | -------------------------------------------------------------------- |
| **削除（GitHub Secrets）**         | `TF_API_TOKEN`                                                       |
| **削除（GitHub Workflows）**       | `terraform-cloudflare-{shared,dev,prod}.yml`                         |
| **削除（Railway 全サービス env）** | api / mcp / hocuspocus の Variables 一式                             |
| **削除（Railway リソース）**       | Postgres、Redis、各サービス                                          |
| **削除（Terraform Cloud）**        | shared / dev / prod ワークスペース                                   |
| **削除（Dashboard）**              | 未使用 R2 API Token（presign 仍用なら **残す**）                     |
| **維持**                           | `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, Worker secrets 一式 |

---

## コピー手順（Railway → Worker）/ Copy checklist

1. Railway dashboard → api サービス → Variables をエクスポート（または 1 件ずつ）。
2. `server/api` で `bunx wrangler secret list --env dev` と突合。
3. マスター一覧の「必須」をすべて `wrangler secret put`。
4. `/health` で `runtime: cloudflare-workers` と `git_commit_sha` を確認。
5. auth / media upload / webhook のスモークテスト。
6. production は dev 成功後に `--env production` で同手順。

---

## やってはいけないこと / Guardrails

- **異なる `BETTER_AUTH_SECRET` を API / MCP / Hocuspocus / Worker に置かない。**
- **`STORAGE_*` secrets を binding 導入後も削除しない** — presigned PUT に S3 API 資格情報が必要（Phase 2a 時点）。
- **Terraform / Railway の secrets を Phase 5 前に一括削除しない** — ロールバック不能。
- **GitHub Issue / PR に秘密値を貼らない** — 名前とフェーズのみ。

---

## 関連 / Related

- [migration-plan.md](migration-plan.md) — フェーズ定義
- [token-scopes.md](token-scopes.md) — API トークンスコープ
- `server/api/.env.example` — 鍵名とコメント
- Epic [#1088](https://github.com/otomatty/zedi/issues/1088)
