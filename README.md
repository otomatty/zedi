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
Demo screenshots: place assets under public/ when available. Tracked prose lives in source (TSDoc); optional local docs/ is gitignored — see AGENTS.md.
-->

---

## 🚀 Getting Started

### 前提条件

- [Bun](https://bun.sh/) v1.0 以上（必須）
- [Node.js](https://nodejs.org/) v24 以上（任意。CI・一部スクリプトで使用。`.nvmrc` / `engines.node` 参照）

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

Docker で複数インスタンスを動かす場合は、ポートをずらして起動する（チーム内で手順を共有する）。

> **Note:** Dockerを使う場合、最低8GBのRAM（推奨: 16GB以上）が必要です。軽量な並列開発が必要な場合は、環境変数によるポート設定の方が適しています。

### デスクトップアプリ（Tauri）

Zedi は [Tauri 2.0](https://v2.tauri.app/) によるデスクトップアプリとしても起動できます。

#### 前提条件（Desktop）

- [Rust](https://www.rust-lang.org/tools/install) (rustup で stable を導入)
- **Windows**: Microsoft C++ Build Tools + Windows 11 SDK
- **macOS**: Xcode Command Line Tools (`xcode-select --install`)
- **Linux**: `libwebkit2gtk-4.1-dev`, `build-essential`, `libssl-dev` 等（[詳細](https://v2.tauri.app/guides/prerequisites/)）

#### デスクトップアプリの起動

```bash
# 開発モード（Vite dev server + Tauri WebView）
bun run tauri:dev

# プロダクションビルド（インストーラー生成）
bun run tauri:build
```

- **Claude Code sidecar** ([Issue #456](https://github.com/otomatty/zedi/issues/456)): Tauri bundles a compiled helper under `src-tauri/binaries/` (`externalBin`). On first `bun run tauri:dev`, a missing binary is built automatically; run `bun run sidecar:build` manually if needed. / `externalBin` 用の sidecar は `src-tauri/binaries/` に配置する。初回 `tauri:dev` で自動ビルド、手動は `bun run sidecar:build`。

> **Windows + Git Bash の場合**: MSVC のビルドツールが PATH に含まれていない場合、
> Developer Command Prompt for VS 2022 から実行するか、
> `.bashrc` に `LIB`, `INCLUDE`, `PATH` を設定してください。
> 詳細は [Issue #49](https://github.com/otomatty/zedi/issues/49) を参照。
> **Note**: デスクトップ版は現在 Phase D（開発中）です。ストレージは暫定的に IndexedDB を使用しており、
> Tauri 固有のストレージ (SQLite) は [#50](https://github.com/otomatty/zedi/issues/50) で対応予定です。

### 環境変数の設定（オプション）

AI 機能・認証・API 連携を使う場合は、`.env.local` を作成してください。サンプルは [.env.example](.env.example) を参照してください。

```bash
# REST API（Hono on Bun: server/api）。フロントから叩く API のベース URL。
VITE_API_BASE_URL=http://localhost:3000

# リアルタイム共同編集（Hocuspocus / Y.js: server/hocuspocus）
VITE_REALTIME_URL=ws://localhost:1234   # 本番は wss://realtime.zedi-note.app など

# Pro プラン課金（Polar、オプション）
# VITE_POLAR_PRO_MONTHLY_PRODUCT_ID=...
# VITE_POLAR_PRO_YEARLY_PRODUCT_ID=...
```

サーバー側（`server/api`）では Better Auth 用の `BETTER_AUTH_SECRET` / `BETTER_AUTH_URL`、PostgreSQL 接続情報、Polar の `POLAR_ACCESS_TOKEN`、メール送信用 `RESEND_API_KEY` などを設定します。詳細は [.env.example](.env.example) を参照してください。

> **Note:** 環境変数なしでもフロント単体はローカルで動作します（一部データは IndexedDB に保存）。AI 機能はアプリの設定画面から各プロバイダの API キーを入力して使用できます。

---

## 🛠 Tech Stack

| Category          | Technology                                                                                           |
| ----------------- | ---------------------------------------------------------------------------------------------------- |
| **Frontend**      | React 19 + TypeScript 6 / React Router v7                                                            |
| **Build Tool**    | Vite 8 (`@vitejs/plugin-react-swc`) / Bun                                                            |
| **Desktop**       | Tauri 2.0 (Rust) — `src-tauri/`                                                                      |
| **Editor**        | Tiptap 3 (ProseMirror) — tables / math (KaTeX) / code (lowlight) / collaboration (Y.js)              |
| **Styling**       | Tailwind CSS v4 + shadcn/ui (Radix UI primitives) / `next-themes`                                    |
| **State / Data**  | Zustand 5 + TanStack Query 5 / React Hook Form + Zod                                                 |
| **i18n**          | i18next + react-i18next                                                                              |
| **Visualization** | Recharts / `@xyflow/react` (React Flow) / Mermaid / KaTeX / Tesseract.js (OCR)                       |
| **Auth**          | [Better Auth](https://better-auth.com/) (OAuth / セッション cookie)                                  |
| **API**           | `server/api` — Hono on Bun + Drizzle ORM (PostgreSQL)                                                |
| **Database**      | PostgreSQL (Drizzle migrations: `server/api/drizzle/`) / IndexedDB (local・ブラウザ)                 |
| **Realtime**      | `server/hocuspocus` — Hocuspocus (Y.js) によるリアルタイム共同編集                                   |
| **MCP**           | `server/mcp` — Claude Code 連携（stdio / HTTP、詳細は [server/mcp/README.md](server/mcp/README.md)） |
| **Storage**       | AWS S3（API 経由でアップロード、`@aws-sdk/client-s3`）                                               |
| **Billing**       | [Polar](https://polar.sh/) (`@polar-sh/sdk`) — Pro プラン                                            |
| **Email**         | Resend                                                                                               |
| **AI**            | OpenAI / Anthropic / Google Gemini（OpenRouter で価格情報を取得）                                    |
| **Browser Ext.**  | `extension/` — Manifest v3 (Chrome 拡張)                                                             |
| **Admin**         | `admin/` — 別 Vite + React アプリ                                                                    |
| **Workspaces**    | Bun workspaces: `packages/ui`（shadcn）, `packages/claude-sidecar` / `admin`                         |
| **Deploy**        | Cloudflare Pages（フロント） + Railway（`server/api`, `hocuspocus`, `mcp`） / Terraform (Cloudflare) |
| **CI/CD**         | GitHub Actions（lint / typecheck / test / mutation / deploy）                                        |
| **Testing**       | Vitest 4 + Testing Library / Playwright / Stryker（Mutation Testing）                                |
| **Tooling**       | ESLint 9 / Prettier / Husky + lint-staged / commitlint / Knip                                        |

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
- [x] Better Auth による認証（OAuth / セッション cookie）
- [x] Markdown エクスポート
- [x] Backlinks / 2-hop Links 表示
- [x] Linked Pages カード表示

ロードマップの詳細は Issue / Discussions を参照してください。

---

## 🧪 Testing

```bash
# ユニットテスト
bun run test

# E2E テスト
bun run test:e2e

# テストカバレッジ
bun run test:coverage

# Mutation testing（Stryker; 品質の第一指標は Mutation スコア）
bun run test:mutation:dry
bun run test:mutation
```

品質指標・テスト方針・仕様の書き方は [AGENTS.md](AGENTS.md) と [SPECIFICATION_POLICY.md](SPECIFICATION_POLICY.md) を参照してください。

---

## 📁 Project Structure

```
src/                     # フロントエンド本体（React + Vite）
├── components/          # React コンポーネント（editor / page / search / layout / ui ほか）
├── hooks/               # カスタムフック
├── lib/                 # ユーティリティ（`claudeCode/` = Tauri↔Claude Code ブリッジ）
├── pages/               # ルートに対応するページコンポーネント（React Router v7）
├── stores/              # Zustand ストア
└── types/               # TypeScript 型定義

src-tauri/               # Tauri 2.0 デスクトップバックエンド（Rust）
├── src/
│   ├── main.rs          # デスクトップ エントリポイント
│   ├── lib.rs           # Tauri アプリ本体・Commands 定義
│   └── claude_sidecar.rs # Claude Code sidecar プロセス管理（Issue #456）
├── binaries/            # externalBin（`bun run sidecar:build`、gitignore）
├── capabilities/        # セキュリティ権限定義
├── icons/               # アプリアイコン（各 OS 用）
├── Cargo.toml           # Rust 依存管理
└── tauri.conf.json      # Tauri 設定

server/                  # Railway で個別デプロイされる Bun プロジェクト群
├── api/                 # REST / Auth API（Hono on Bun + Better Auth + Drizzle ORM）
├── hocuspocus/          # リアルタイム共同編集サーバー（Hocuspocus / Y.js）
└── mcp/                 # MCP サーバー — Claude Code 連携（stdio / HTTP）。詳細は [server/mcp/README.md](server/mcp/README.md)

packages/                # Bun workspaces（共有ライブラリ）
├── ui/                  # `@zedi/ui` — shadcn/ui ベースの共有 UI コンポーネント
└── claude-sidecar/      # Tauri sidecar 用 Claude Code クライアント

admin/                   # 管理画面アプリ（別 Vite + React + Tailwind / `@zedi/ui` 利用）
extension/               # ブラウザ拡張（Manifest v3、Web Clipper）
server/api/drizzle/      # PostgreSQL マイグレーション（drizzle-kit が読む正本 / source of truth）
terraform/cloudflare/    # Cloudflare 関連インフラ定義
e2e/                     # Playwright E2E テスト
scripts/                 # セットアップ / sidecar ビルド / Stryker / 拡張ビルド等のスクリプト
.github/workflows/       # GitHub Actions（lint / typecheck / test / mutation / deploy）
```

---

## 🤝 Contributing

コントリビューションを歓迎します！

1. このリポジトリをフォーク
2. `develop`ブランチから機能ブランチを作成 (`git checkout -b feature/amazing-feature`)
3. 変更をコミット (`git commit -m 'feat: add amazing feature'`)
4. ブランチをプッシュ (`git push origin feature/amazing-feature`)
5. `develop`ブランチに対して Pull Request を作成

詳細は [CONTRIBUTING.md](CONTRIBUTING.md) と [AGENTS.md](AGENTS.md)（ブランチ・PR・マージ方法）を参照してください。

---

## 📄 License

このプロジェクトは **Business Source License 1.1 (BSL 1.1)** の下で公開されています（Source-Available）。商用の競合サービスとしての提供は制限されますが、個人利用・社内利用・改変・再配布は許可されています。初回公開から **4 年後** に [Mozilla Public License 2.0 (MPL 2.0)](https://www.mozilla.org/en-US/MPL/2.0/) へ自動変換されます。詳細は [LICENSE](LICENSE) を参照してください。

---

## 🙏 Acknowledgments

- [Tiptap](https://tiptap.dev/) — エディタフレームワーク（ProseMirror）
- [shadcn/ui](https://ui.shadcn.com/) / [Radix UI](https://www.radix-ui.com/) — UI コンポーネント
- [Hocuspocus](https://hocuspocus.dev/) / [Y.js](https://yjs.dev/) — リアルタイム共同編集
- [Better Auth](https://better-auth.com/) — 認証（OAuth / セッション cookie）
- [Hono](https://hono.dev/) — API フレームワーク（Bun 上）
- [Drizzle ORM](https://orm.drizzle.team/) — TypeScript ORM
- [Polar](https://polar.sh/) — Pro プランの課金基盤
- [Tauri](https://tauri.app/) — クロスプラットフォーム デスクトップ
- [Cloudflare Pages](https://pages.cloudflare.com/) / [Railway](https://railway.com/) — ホスティング

---

<p align="center">
  Made with ❤️ by Saedgewell
</p>
