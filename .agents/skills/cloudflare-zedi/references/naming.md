# 命名・ドメイン固定値 / Naming & domains

移行前（Terraform 管理）の固定値と、移行後（Wrangler 管理）の方針。
出典: `terraform/cloudflare/{shared,dev,prod}/`（Phase 5 で削除予定）。

## ゾーン / Zone

- DNS ゾーン: `zedi-note.app`（単一アカウント・単一ゾーン。dev/prod 同一トークンで可）

## ドメイン対応 / Domains

| 用途     | prod                     | dev                       |
| -------- | ------------------------ | ------------------------- |
| フロント | `zedi-note.app` (apex)   | `dev.zedi-note.app`       |
| 管理画面 | `admin.zedi-note.app`    | `admin-dev.zedi-note.app` |
| API      | `api.zedi-note.app`      | （dev 設定に従う）        |
| Realtime | `realtime.zedi-note.app` | （dev 設定に従う）        |

> 移行前は `api` / `realtime` は Railway への CNAME（proxied）。Workers 化後は各 Worker の
> `routes` に `{ pattern: "api.zedi-note.app", custom_domain: true }` を設定し、DNS を
> Cloudflare に自動生成させる。旧 Railway CNAME と検証 TXT はカットオーバー後に撤去。

## プロジェクト/Worker 名 / Project & Worker names

移行前 Pages プロジェクト名（参考。Workers 化で置換）:

| 環境 | フロント   | 管理画面         |
| ---- | ---------- | ---------------- |
| prod | `zedi`     | `zedi-admin`     |
| dev  | `zedi-dev` | `zedi-admin-dev` |

移行後 Worker 名（提案。`wrangler.jsonc` の `name` + `env`）:

| サービス      | 提案 Worker 名  | 環境分離                     |
| ------------- | --------------- | ---------------------------- |
| フロント      | `zedi-web`      | `env.dev` / `env.production` |
| 管理画面      | `zedi-admin`    | `env.dev` / `env.production` |
| API           | `zedi-api`      | `env.dev` / `env.production` |
| MCP           | `zedi-mcp`      | `env.dev` / `env.production` |
| Realtime (DO) | `zedi-realtime` | `env.dev` / `env.production` |

> Worker 名は Cloudflare の名前制約（長さ等）に従う。環境は単一 Worker を `env.*` で分けるか、
> 名前サフィックス（`-dev`）で分けるかを Phase 2 着手時に確定する。

## 環境変数の対応 / Env vars

GitHub Environments（development / production）の既存 `vars` / `secrets`:

- `vars`: `API_BASE_URL`, `REALTIME_URL`, `MAIN_APP_URL`, `MCP_BASE_URL`, `POLAR_MONTHLY_ID`, `POLAR_YEARLY_ID`
- `secrets`: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `DATABASE_URL`（D1 移行で不要化予定）, `TF_API_TOKEN`（Terraform 廃止で削除）
