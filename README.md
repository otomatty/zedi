<p align="center">
  <img src="public/favicon.svg" alt="Zedi Logo" width="120" height="120" />
</p>

<h1 align="center">Zedi</h1>

<p align="center">
  <strong>Zero-Friction Knowledge Network</strong><br />
  思考を宇宙のように拡張する、AIネイティブなナレッジアプリ
</p>

<p align="center">
  <a href="#features">Features</a> •
  <a href="#demo">Demo</a> •
  <a href="#getting-started">Getting Started</a> •
  <a href="#tech-stack">Tech Stack</a> •
  <a href="#roadmap">Roadmap</a> •
  <a href="#contributing">Contributing</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/status-alpha-orange" alt="Status: Alpha" />
  <img src="https://img.shields.io/badge/license-BSL%201.1-blue" alt="License: BSL 1.1" />
  <img src="https://img.shields.io/badge/PRs-welcome-brightgreen" alt="PRs Welcome" />
</p>

---

## 🌟 Overview

**Zedi** は、「書くストレス」と「整理する義務」からあなたを解放するナレッジアプリです。

従来のメモアプリでは、情報をフォルダに分類し、手動でリンクを作成する必要がありました。Zedi は AI による足場生成（Scaffolding）と WikiLink によるネットワーク構造で、思考を自然に拡張させます。

### 💡 デザイン原則

- **Speed & Flow** — 起動0秒、保存不要。思考の速度で書ける
- **Context over Folder** — フォルダ不要。時間とリンクで自然に整理
- **Atomic & Constraint** — 1ページ1アイデア。小さく繋げる
- **Scaffolding by AI** — AIが知識の足場を自動生成
- **Dormant Seeds** — 未整理のメモも「発芽待ちの種」として許容

---

## ✨ Features

### 📅 Date Grid

日付ごとにグループ化されたページをグリッド表示。「いつ何を書いたか」が一目瞭然。

### 🔗 WikiLinks

`[[ページタイトル]]` 記法で簡単にページ間リンク。オートコンプリート付きで既存ページにすばやくアクセス。

### 🤖 AI Wiki Generator

キーワードを選択して AI に解説を生成させると、関連トピックへのリンクも自動挿入。知識のネットワークが自動的に広がります。

### 🌐 Web Clipper

URL を入力するだけで Web ページの本文を自動抽出。あとから自分のペースでキーワードをリンク化できます。

### 🔍 Global Search

`Cmd+K` / `Ctrl+K` で全文検索を起動。キーワードを含むページを瞬時に発見。

### 🔀 Linked Pages

ページ下部に関連ページを自動表示：

- **Outgoing Links** — このページからリンクしている先
- **Backlinks** — このページにリンクしている元
- **2-hop Links** — リンク先のリンク先まで辿れる

### ⌨️ Keyboard Shortcuts

- `Cmd/Ctrl + K` — グローバル検索
- `Cmd/Ctrl + N` — 新規ページ作成
- `Cmd/Ctrl + H` — ホーム画面へ
- `Cmd/Ctrl + /` — ショートカット一覧

### 📝 Markdown Editor

Tiptap ベースのリッチエディタ。Markdown ショートカットでシームレスに書ける。

- `# ` → 見出し
- `- ` → 箇条書き
- `> ` → 引用
- `**text**` → 太字
- `` ` `` → コードブロック

---

## 🎬 Demo

> 🚧 **Coming Soon** — スクリーンショットとデモ動画を準備中です

<!--
![Date Grid Demo](docs/assets/demo-date-grid.png)
![Wiki Generator Demo](docs/assets/demo-wiki-generator.gif)
-->

---

## 🚀 Getting Started

### 前提条件

- [Bun](https://bun.sh/) v1.0 以上
- [Node.js](https://nodejs.org/) v24 以上

### クイックスタート

```bash
# リポジトリをクローン
git clone https://github.com/otomatty/zedi.git
cd zedi

# セットアップスクリプトを実行（依存関係インストール + Git hooks 設定 + 検証）
bash scripts/setup.sh

# 開発サーバーを起動
bun run dev
```

### 手動セットアップ

```bash
git clone https://github.com/otomatty/zedi.git
cd zedi
bun install
bun run dev
```

ブラウザで http://localhost:30000 を開いてください（デフォルトポート）。

### ポート設定

複数のアプリを並列で開発する場合、ポートを変更できます：

```bash
# 方法1: 環境変数で指定
VITE_PORT=30001 bun run dev

# 方法2: .env.local ファイルを作成
echo "VITE_PORT=30001" > .env.local
bun run dev
```

ポートが使用中の場合は、自動的に次の利用可能なポートが使用されます。

### Dockerを使った並列開発（オプション）

複数のアプリケーションインスタンスを並列で開発する場合、Dockerを使用できます：

```bash
# Dockerイメージをビルド
bun run docker:build

# すべてのインスタンスを起動（3つ同時に起動）
bun run docker:up

# バックグラウンドで起動
bun run docker:up:d

# 停止
bun run docker:down

# ログを確認
bun run docker:logs
```

起動後、以下のURLでアクセスできます：

- インスタンス1: http://localhost:30000
- インスタンス2: http://localhost:30001
- インスタンス3: http://localhost:30002

詳細は [Docker並列開発ガイド](./docs/guides/docker-parallel-development.md) を参照してください。

> **Note:** Dockerを使う場合、最低8GBのRAM（推奨: 16GB以上）が必要です。軽量な並列開発が必要な場合は、環境変数によるポート設定の方が適しています。

### 環境変数の設定（オプション）

AI 機能・認証・API 連携を使う場合は、`.env.local` を作成してください。サンプルは [.env.example](.env.example) を参照してください。

```bash
# 認証（Cognito / Google・GitHub OAuth）
VITE_COGNITO_DOMAIN=your-user-pool-domain.auth.region.amazoncognito.com
VITE_COGNITO_CLIENT_ID=your-app-client-id

# REST API（Lambda + API Gateway）。本番・開発で API の URL を設定
VITE_ZEDI_API_BASE_URL=https://xxxxxxxxxx.execute-api.ap-northeast-1.amazonaws.com

# AI ストリーミング用 WebSocket（オプション）
# VITE_AI_WS_URL=wss://...

# リアルタイム共同編集（Hocuspocus）
# VITE_REALTIME_URL=ws://localhost:1234 または wss://...

# Pro プラン課金（LemonSqueezy、オプション）
# VITE_LEMONSQUEEZY_STORE_ID=...
# VITE_LEMONSQUEEZY_AI_MONTHLY_PRODUCT_ID=...
# VITE_LEMONSQUEEZY_AI_YEARLY_PRODUCT_ID=...
```

> **Note:** 環境変数なしでもローカルで動作します（IndexedDB に保存）。AI 機能は設定画面から API キーを入力して使用できます。

---

## 🛠 Tech Stack

| Category       | Technology                                                |
| -------------- | --------------------------------------------------------- |
| **Frontend**   | React 18 + TypeScript                                     |
| **Build Tool** | Vite                                                      |
| **Editor**     | Tiptap (ProseMirror)                                      |
| **Styling**    | Tailwind CSS + shadcn/ui                                  |
| **State**      | Zustand + TanStack Query                                  |
| **Auth**       | Cognito (Google/GitHub OAuth)                             |
| **Database**   | Aurora (PostgreSQL) via API / IndexedDB (local・ブラウザ) |
| **Realtime**   | Hocuspocus (Y.js) — リアルタイム共同編集                  |
| **Billing**    | LemonSqueezy（Pro プラン）                                |
| **AI**         | OpenAI / Anthropic / Google Gemini                        |
| **Deploy**     | AWS (S3 + CloudFront, Lambda + API Gateway)               |
| **Testing**    | Vitest + Playwright                                       |

---

## 🗺 Roadmap

### ✅ 完了

- [x] React + Vite 基盤構築
- [x] ページの CRUD 操作
- [x] Date Grid UI
- [x] WikiLink 機能（サジェスト付き）
- [x] AI Wiki Generator
- [x] Web Clipper
- [x] Global Search
- [x] キーボードショートカット
- [x] Cognito 認証連携（Google/GitHub OAuth）
- [x] Markdown エクスポート
- [x] Backlinks / 2-hop Links 表示
- [x] Linked Pages カード表示

### 📋 予定

- [ ] Tauri 2.0 デスクトップアプリ
- [ ] iOS / Android モバイルアプリ
- [ ] Share Sheet 連携
- [ ] Magic Split / Flick-to-Split
- [ ] Ghost Link System
- [ ] Semantic Search（ベクトル検索）

詳細は [PRD](docs/PRD.md) を参照してください。

---

## 🧪 Testing

```bash
# ユニットテスト
bun run test

# E2E テスト
bun run test:e2e

# テストカバレッジ
bun run test:coverage
```

---

## 📁 Project Structure

```
src/
├── components/          # React コンポーネント
│   ├── editor/          # エディタ関連
│   ├── page/            # ページ表示関連
│   ├── search/          # 検索関連
│   ├── layout/          # レイアウト
│   └── ui/              # shadcn/ui コンポーネント
├── hooks/               # カスタムフック
├── lib/                 # ユーティリティ
├── pages/               # ページコンポーネント
├── stores/              # Zustand ストア
└── types/               # TypeScript 型定義
```

---

## 🤝 Contributing

コントリビューションを歓迎します！

1. このリポジトリをフォーク
2. `develop`ブランチから機能ブランチを作成 (`git checkout -b feature/amazing-feature`)
3. 変更をコミット (`git commit -m 'feat: add amazing feature'`)
4. ブランチをプッシュ (`git push origin feature/amazing-feature`)
5. `develop`ブランチに対して Pull Request を作成

詳細は [CONTRIBUTING.md](CONTRIBUTING.md) と [ブランチ戦略ガイド](docs/guides/branch-strategy.md) を参照してください。

---

## 📄 License

このプロジェクトは **Business Source License 1.1 (BSL 1.1)** の下で公開されています（Source-Available）。商用の競合サービスとしての提供は制限されますが、個人利用・社内利用・改変・再配布は許可されています。初回公開から **4 年後** に [Mozilla Public License 2.0 (MPL 2.0)](https://www.mozilla.org/en-US/MPL/2.0/) へ自動変換されます。詳細は [LICENSE](LICENSE) を参照してください。

---

## 🙏 Acknowledgments

- [Tiptap](https://tiptap.dev/) — エディタフレームワーク
- [shadcn/ui](https://ui.shadcn.com/) — UI コンポーネント
- [Hocuspocus](https://hocuspocus.dev/) — リアルタイム共同編集（Y.js）
- [Amazon Cognito](https://aws.amazon.com/cognito/) — 認証（Google/GitHub OAuth）

---

<p align="center">
  Made with ❤️ by Saedgewell
</p>
