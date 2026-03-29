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

出力は `admin/dist`。本番は Terraform で管理する Cloudflare Pages プロジェクト `zedi-admin` に対して、GitHub Actions `deploy-prod.yml` から自動デプロイする。

## 環境変数

- **開発:** `.env` に `ZEDI_API_PROXY_TARGET=http://localhost:3000` を設定すると `/api` がその API にプロキシされる。
- **本番:** GitHub Actions の production environment から `VITE_API_BASE_URL=https://api.zedi-note.app` を渡してビルドする。`VITE_MAIN_APP_URL` は `https://zedi-note.app` を使用する。

## 仕様

- 挙動・契約は **ソースの TSDoc** とテストを正とする（[`SPECIFICATION_POLICY.md`](../SPECIFICATION_POLICY.md)）。
- [Issue #141 — AIモデル管理](https://github.com/otomatty/zedi/issues/141)
