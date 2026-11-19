# 命名・ドメイン固定値 / Naming & domains

## ゾーン / Zone

- DNS ゾーンは `zedi-note.app`。本番と staging は同じアカウントとゾーンを使う。

## ドメイン / Domains

以下は予定のドメイン。staging は Cloudflare Access の内側に置く。

| 用途   | production      | staging                 |
| ------ | --------------- | ----------------------- |
| アプリ | `zedi-note.app` | `staging.zedi-note.app` |

旧 Pages のカスタムドメインと CNAME、Railway 用の `api` / `realtime` の CNAME と検証用 TXT は削除済み（#1154）。

## Worker 名 / Worker names

| 環境       | Worker 名          | `app/wrangler.jsonc` |
| ---------- | ------------------ | -------------------- |
| production | `zedi-app`         | `env.production`     |
| staging    | `zedi-app-staging` | `env.staging`        |

両環境ともデプロイ済み。独自ドメインは設定予定で、`workers_dev` と `preview_urls` は `false`。

## D1

| 環境       | データベース名     | 状態                                      |
| ---------- | ------------------ | ----------------------------------------- |
| local      | `zedi-app`         | 最上位の `database_id` はプレースホルダー |
| production | `zedi-app`         | 作成済み。ID は `env.production` に記載   |
| staging    | `zedi-app-staging` | 作成済み。ID は `env.staging` に記載      |

## R2 バケット / R2 buckets (#1089)

旧 API 向けに作ったバケット。`app/` はまだ R2 を使っていない。メディアを扱うときに使うか、
不要なら削除する。

| 環境       | バケット名          | 状態                       |
| ---------- | ------------------- | -------------------------- |
| 非本番     | `zedi-storage-dev`  | 作成済み (APAC / Standard) |
| production | `zedi-storage-prod` | 作成済み (APAC / Standard) |

## GitHub の変数・Secrets / GitHub vars & secrets

GitHub Environments は `staging` と `production` を使う。旧 Environment `development` は運用対象外。

- **Secrets** `CLOUDFLARE_API_TOKEN` と `CLOUDFLARE_ACCOUNT_ID` を各 Environment に設定する。
- **任意の変数** `APP_URL` を設定すると、デプロイ後にその URL を確認する。
- **任意の Secrets** `CF_ACCESS_CLIENT_ID` と `CF_ACCESS_CLIENT_SECRET` を設定すると、確認時に Cloudflare Access のサービストークンを送る。

旧ビルド用変数と `DATABASE_URL` / `TF_API_TOKEN` は削除済み（#1154）。
