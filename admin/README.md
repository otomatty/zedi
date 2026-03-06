# Zedi 管理画面

管理者用 SPA（admin.zedi-note.app）。認証基盤と AI モデル管理を提供。

## 開発

```bash
# 初回のみ
cd admin && npm install

# 起動（ポート 30001、API は ZEDI_API_PROXY_TARGET でプロキシ）
bun run dev
```

ルートから:

```bash
bun run dev:admin
```

## ビルド

```bash
cd admin && bun run build
```

出力は `admin/dist`。Cloudflare Pages ではビルドコマンドを `cd admin && npm ci && npm run build`、出力ディレクトリを `admin/dist` に設定する。

## 環境変数

- **開発:** `.env` に `ZEDI_API_PROXY_TARGET=http://localhost:3000` を設定すると `/api` がその API にプロキシされる。
- **本番:** Cloudflare で `VITE_API_BASE_URL=https://api.zedi-note.app` を設定。

## 仕様

- [管理者基盤・サブドメイン仕様](../docs/specs/admin-base-spec.md)
- [Issue #141 — AIモデル管理](https://github.com/otomatty/zedi/issues/141)
