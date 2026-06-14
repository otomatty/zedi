> **言語:** [English](README.md) | 日本語

# Zedi 管理画面

管理者用 SPA（admin.zedi-note.app）。認証基盤と AI モデル管理を提供。

## 開発

```bash
# 初回のみ
cd admin && npm install

# 起動（ポート 30001、API は ZEDI_API_PROXY_TARGET でプロキシ）
npm run dev
```

ルートから:

```bash
npm run dev:admin
```

## ローカル動作確認

バックエンド（`docker-compose -f docker-compose.dev.yml up --build`）起動後、管理画面を起動し、以下を確認する。

- [ ] `http://localhost:30001` で管理画面が表示される
- [ ] ログイン（Google/GitHub）後、管理者ユーザーなら AI モデル一覧が表示される
- [ ] 非管理者なら「管理者権限がありません」等の案内が出る
- [ ] モデルのトグル・ティア変更・同期が動作する

## ビルド

```bash
cd admin && npm install && npm run build
```

出力は `admin/dist`。デプロイ先:

| 環境 | URL                       | Cloudflare Pages | ワークフロー      |
| ---- | ------------------------- | ---------------- | ----------------- |
| 本番 | `admin.zedi-note.app`     | `zedi-admin`     | `deploy-prod.yml` |
| 開発 | `admin-dev.zedi-note.app` | `zedi-admin-dev` | `deploy-dev.yml`  |

いずれも Terraform（`terraform/cloudflare/prod` / `dev`）で管理する。

## 環境変数

- **開発（ローカル）:** `.env` に `ZEDI_API_PROXY_TARGET=http://localhost:3000` を設定すると `/api` がその API にプロキシされる。
- **本番:** GitHub Actions の production environment から `VITE_API_BASE_URL`・`VITE_MAIN_APP_URL`・`VITE_ENV_LABEL=production` を渡してビルドする。
- **開発（デプロイ）:** GitHub Actions の development environment から dev API の `VITE_API_BASE_URL`、`VITE_MAIN_APP_URL`（`https://dev.zedi-note.app`）、`VITE_ENV_LABEL=development` を渡す。サイドバーに **開発環境** バッジを表示し、本番への誤操作を防ぐ。

初回の dev 管理画面デプロイ後、Railway **api-dev** の `CORS_ORIGIN` に `https://admin-dev.zedi-note.app` を追加し、`ADMIN_BASE_URL=https://admin-dev.zedi-note.app` を設定すること。GitHub **development** 変数 `MAIN_APP_URL=https://dev.zedi-note.app` も未設定なら追加する。

## 仕様

- 挙動・契約は **ソースの TSDoc** とテストを正とする（[`SPECIFICATION_POLICY.md`](../SPECIFICATION_POLICY.md)）。
- [Issue #141 — AIモデル管理](https://github.com/otomatty/zedi/issues/141)
