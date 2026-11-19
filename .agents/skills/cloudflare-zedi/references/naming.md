# 命名・ドメイン固定値 / Naming & domains

## ゾーン / Zone

- DNS ゾーン: `zedi-note.app`（単一アカウント・単一ゾーン。dev/prod 同一トークンで可）

## ドメイン / Domains

`app/` の Worker 1 本がフロント・API・共同編集を同じオリジンで配信するため、`api` / `realtime` の
サブドメインは使わない。

| 用途          | prod                  | dev                       |
| ------------- | --------------------- | ------------------------- |
| アプリ        | `zedi-note.app`       | `dev.zedi-note.app`       |
| 管理画面（※） | `admin.zedi-note.app` | `admin-dev.zedi-note.app` |

> ※ 管理画面を `app/` の Worker に含めるか別にするかは、管理機能を移すときに決める。
>
> 上の 4 つには、旧 Pages プロジェクトへの CNAME と Pages のカスタムドメインが残っている
> （Terraform で作ったもの。Terraform は削除済み）。Worker の `custom_domain` に移す前に、
> ダッシュボードで外す。Railway 向けの `api` / `realtime` の CNAME と検証用 TXT も残っているので削除する。

## Worker 名 / Worker names

| 環境 | Worker 名        | 備考                                                           |
| ---- | ---------------- | -------------------------------------------------------------- |
| prod | `zedi-app`       | `app/wrangler.jsonc` の `name`                                 |
| dev  | `zedi-app` + env | `env.dev` で分けるか `-dev` サフィックスにするかは初回に決める |

旧構成で使っていた名前（削除済み、またはダッシュボードで削除する対象）:

| 種類               | 名前                                                             |
| ------------------ | ---------------------------------------------------------------- |
| Pages プロジェクト | `zedi`, `zedi-admin`, `zedi-dev`, `zedi-admin-dev`               |
| dev の Worker      | `zedi-web-dev`, `zedi-admin-dev`, `zedi-api-dev`, `zedi-mcp-dev` |

## D1

| 環境  | データベース名 | 状態                                                     |
| ----- | -------------- | -------------------------------------------------------- |
| local | `zedi-app`     | `app/wrangler.jsonc`（`database_id` はプレースホルダー） |
| dev   | 未作成         |                                                          |
| prod  | 未作成         |                                                          |

## R2 バケット / R2 buckets (#1089)

旧 API 向けに作ったバケット。`app/` はまだ R2 を使っていない。メディアを扱うときに使うか、
不要なら削除する。

| 環境 | バケット名          | 状態                       |
| ---- | ------------------- | -------------------------- |
| dev  | `zedi-storage-dev`  | 作成済み (APAC / Standard) |
| prod | `zedi-storage-prod` | 作成済み (APAC / Standard) |

## GitHub の変数・Secrets / GitHub vars & secrets

GitHub Environments（development / production）に残っているもの:

- `vars`: `API_BASE_URL`, `REALTIME_URL`, `MAIN_APP_URL`, `MCP_BASE_URL`, `POLAR_MONTHLY_ID`, `POLAR_YEARLY_ID`
  — 旧フロント / admin のビルド用。デプロイを止めたので不要。
- `secrets`:
  - `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` — 今後の `app/` のデプロイで使う。
  - `DATABASE_URL` — 旧 API の Postgres 用。不要。
  - `TF_API_TOKEN` — Terraform を削除したので不要。
