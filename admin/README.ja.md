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

旧バックエンド（`server/api`）は削除済みのため、管理機能を `app/` に移すまではログインと以下の確認はできない。移したときの確認項目として残している。

- [ ] `http://localhost:30001` で管理画面が表示される
- [ ] ログイン（Google/GitHub）後、管理者ユーザーなら AI モデル一覧が表示される
- [ ] 非管理者なら「管理者権限がありません」等の案内が出る
- [ ] モデルのトグル・ティア変更・同期が動作する

## ビルド

```bash
cd admin && npm install && npm run build
```

出力は `admin/dist`。旧バックエンドとともに `deploy-dev.yml` / `deploy-prod.yml` を削除したため、デプロイはしていない。旧 Cloudflare Pages のプロジェクト（`zedi-admin`・`zedi-admin-dev`）は、ダッシュボードで削除するまで残る。

## 環境変数

- **開発（ローカル）:** `.env` に `ZEDI_API_PROXY_TARGET` を設定すると `/api` がその API にプロキシされる。
- **ビルド:** `VITE_API_BASE_URL`・`VITE_MAIN_APP_URL`・`VITE_ENV_LABEL`（`production` / `development`。`development` ならサイドバーに **開発環境** バッジを表示する）。

## 仕様

- 挙動・契約は **ソースの TSDoc** とテストを正とする（[`AGENTS.md`](../AGENTS.md)）。
- [Issue #141 — AIモデル管理](https://github.com/otomatty/zedi/issues/141)
