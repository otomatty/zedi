> **言語:** [English](README.md) | 日本語

# Zedi Web Clipper

Chrome 拡張機能。ワンクリックで Web ページを Zedi に保存する。

## 機能

- **ワンクリック保存**: ポップアップまたはコンテキストメニューから現在のページを保存
- **ショートカット**: `Ctrl+Shift+S`（mac: `Command+Shift+S`）で保存
- **OAuth 2.0 + PKCE**: Zedi アカウントへの安全な接続

## インストール

### 本番環境

1. [Chrome ウェブストア](https://chrome.google.com/webstore) からインストール（公開後）
2. または、Zedi から「拡張機能を接続」で案内される手順に従う

### 開発検証

本番以外の環境（例: dev.zedi-note.app）で拡張を試す場合:

1. ルートで以下を実行し、dev 用 config を生成:
   ```bash
   bun run prepare:extension:dev
   ```
2. Chrome で `chrome://extensions` を開く
3. 「デベロッパーモード」を ON
4. 「パッケージ化されていない拡張機能を読み込む」→ この `extension/` フォルダを選択

## ビルド時環境切り替え

拡張は **1 つのベース URL** で認証ページ（`/auth/extension`）と API（`/api/ext/*`）にアクセスする。

| 環境 | コマンド                         | ベース URL                |
| ---- | -------------------------------- | ------------------------- |
| 本番 | `bun run prepare:extension:prod` | https://zedi-note.app     |
| 開発 | `bun run prepare:extension:dev`  | https://dev.zedi-note.app |

- 本番 zip 作成前に `prepare:extension:prod` を実行してから `extension/` を zip する。
- 開発者は `prepare:extension:dev` で dev 環境用に切り替える。

## ファイル構成

```plaintext
extension/
  config.js         # popup 用（prepare-extension.js が生成。手動編集しない）
  config.worker.js  # background 用（同上）
  constants.js      # 共有定数（popup と background から読み込み）
  manifest.json     # 拡張マニフェスト
  popup.html        # ポップアップ UI
  popup.js          # ポップアップロジック
  background.js     # サービスワーカー（コンテキストメニュー・ショートカット）
  README.ja.md      # 本ファイル
```

## 前提条件

- Zedi アカウント（https://zedi-note.app または dev.zedi-note.app）
- 保存対象 URL は `http://` または `https://` のみ。`localhost`・`chrome://`・プライベート IP は不可。

## サーバー側 CORS

拡張から API を呼ぶには、API の `CORS_ORIGIN` に拡張の origin を明示する必要があります。Chrome の `chrome://extensions` で拡張 ID を確認し、`CORS_ORIGIN` に `chrome-extension://<そのID>` を追加してください（カンマ区切り）。

## ライセンス

本リポジトリのルート `LICENSE` に準拠。
