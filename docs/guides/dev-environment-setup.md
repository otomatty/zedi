# 開発環境セットアップガイド

本番環境と開発環境を分離し、開発者データを同期する方法について説明します。

## 概要

```
┌─────────────────┐                     ┌─────────────────┐
│   Production    │                     │   Development   │
├─────────────────┤                     ├─────────────────┤
│ Turso: zedi-prod│ ←── sync script ──→ │ Turso: zedi-dev │
│ Clerk: pk_live_ │                     │ Clerk: pk_test_ │
│ 全ユーザーデータ │                     │ 開発者データのみ │
└─────────────────┘                     └─────────────────┘
```

- **本番環境**: 全ユーザーのデータを含む
- **開発環境**: 開発者のデータのみ（テストデータで本番DBを圧迫しない）
- **同期スクリプト**: 開発者のデータを両環境で同期

## 1. Turso 開発データベースの作成

```bash
# Turso CLIのインストール（未インストールの場合）
curl -sSfL https://get.turso.tech/install.sh | bash

# ログイン
turso auth login

# 開発用データベースを作成（東京リージョン）
turso db create zedi-dev --region nrt

# データベースURLを取得
turso db show zedi-dev --url
# 出力例: libsql://zedi-dev-YOUR_USERNAME.aws-ap-northeast-1.turso.io

# 認証トークンを作成
turso db tokens create zedi-dev
# 出力例: eyJhbGci...（長いトークン）
```

## 2. Clerk 開発インスタンスの作成

1. [Clerk Dashboard](https://dashboard.clerk.com) にアクセス
2. 左上のアプリケーション名をクリック → "Create application"
3. アプリケーション名: `zedi-dev` など
4. 認証方法を本番と同じ設定にする（Email, Google等）
5. 作成後、API Keys から `Publishable Key` をコピー

> **重要**: 開発インスタンスの Publishable Key は `pk_test_` で始まります

### Turso JWT テンプレートの設定（オプション）

本番環境でTurso JWKS認証を使用している場合は、開発インスタンスでも設定が必要です：

1. Clerk Dashboard → JWT Templates
2. 本番と同じテンプレートを作成
3. Turso側でも開発DB用のJWKS設定を行う

## 3. 環境変数ファイルの設定

### Viteの環境変数優先順位

Viteは以下の順序で環境変数ファイルを読み込みます（上から優先度が高い順）：

1. **`.env.[mode].local`** - 最優先（例: `.env.development.local`）
2. **`.env.local`** - 全環境共通のローカル設定
3. **`.env.[mode]`** - モード固有（例: `.env.development`, `.env.production`）
4. **`.env`** - デフォルト

> **重要**: `.env.local` と `.env.development` が両方存在する場合、**`.env.local` の方が優先されます**。
> 
> 環境を正しく分離するには、以下のいずれかの方法を取ってください：
> 
> **方法1: `.env.local` を削除**
> ```bash
> rm .env.local
> ```
> 
> **方法2: `.env.local` をバックアップ**
> ```bash
> mv .env.local .env.local.backup
> ```
> 
> **方法3: モード固有のローカルファイルを使用（推奨）**
> ```bash
> # .env.local を削除し、代わりに以下を使用
> # .env.development.local  (開発環境用)
> # .env.production.local   (本番環境用)
> ```

### `.env.development`

```bash
# 開発環境設定
VITE_CLERK_PUBLISHABLE_KEY=pk_test_YOUR_DEVELOPMENT_CLERK_KEY
VITE_TURSO_DATABASE_URL=libsql://zedi-dev-YOUR_USERNAME.turso.io
VITE_TURSO_AUTH_TOKEN=YOUR_DEVELOPMENT_TURSO_TOKEN
```

### `.env.production`

```bash
# 本番環境設定（既存の値を使用）
VITE_CLERK_PUBLISHABLE_KEY=pk_live_...
VITE_TURSO_DATABASE_URL=libsql://zedi-otomatty...
VITE_TURSO_AUTH_TOKEN=...
```

## 4. 開発者ユーザーIDマッピングの設定

開発者のデータを同期するために、本番と開発のClerkユーザーIDを紐づけます。

### ユーザーIDの取得方法

**本番環境のユーザーID:**
1. 本番環境でアプリにログイン
2. Clerk Dashboard → Users → 該当ユーザーを選択
3. `user_` で始まるIDをコピー

**開発環境のユーザーID:**
1. 開発環境（`bun dev`）を起動
2. アプリにログイン（同じメールアドレスで）
3. Clerk Dashboard（開発インスタンス）→ Users → 該当ユーザー
4. `user_` で始まるIDをコピー

### マッピングファイルの作成

```bash
# サンプルファイルをコピー
cp scripts/sync/dev-user-mapping.example.json scripts/sync/dev-user-mapping.json
```

`scripts/sync/dev-user-mapping.json` を編集：

```json
{
  "developers": [
    {
      "email": "your-email@example.com",
      "productionUserId": "user_2abc123...",
      "developmentUserId": "user_2xyz789...",
      "description": "開発者アカウント"
    }
  ],
  "syncOptions": {
    "direction": "bidirectional",
    "conflictResolution": "latest-wins",
    "syncDeleted": true
  }
}
```

## 5. データ同期の実行

### 基本的な同期

```bash
# 双方向同期（デフォルト）
bun run sync:dev

# ドライラン（実際には変更しない）
bun run sync:dev:dry

# 詳細ログ付き
bun run sync:dev:verbose
```

### 特定方向への同期

```bash
# 本番 → 開発 のみ
bun run sync:prod-to-dev

# 開発 → 本番 のみ
bun run sync:dev-to-prod
```

### 同期オプション

| オプション | 説明 |
|-----------|------|
| `--dry-run` | 変更をシミュレーション |
| `--verbose` | 詳細ログを表示 |
| `--direction <dir>` | 同期方向を指定 |

## 6. 開発ワークフロー

### 日常の開発

```bash
# 開発サーバー起動（.env.development を自動使用）
bun dev

# 本番データを開発環境に同期
bun run sync:prod-to-dev
```

### ビルド

```bash
# 本番ビルド（.env.production を使用）
bun run build

# 開発モードビルド（デバッグ用）
bun run build:dev
```

## 同期の仕組み

### データの整合性

- **ページID**: 両環境で同一IDを使用
- **ユーザーID**: 環境に応じて変換
- **競合解決**: `updated_at` タイムスタンプで最新を優先

### 同期対象

| テーブル | 同期内容 |
|---------|---------|
| `pages` | ページデータ（タイトル、コンテンツ等） |
| `links` | ページ間のリンク関係 |
| `ghost_links` | 未作成ページへのリンク |

## トラブルシューティング

### 「Configuration file not found」エラー

```bash
cp scripts/sync/dev-user-mapping.example.json scripts/sync/dev-user-mapping.json
```

### 「Development database credentials are not configured」エラー

`.env.development` のプレースホルダーを実際の値に置き換えてください。

### 同期後にデータが見えない

1. ブラウザのキャッシュをクリア
2. ローカルデータベース（IndexedDB）をクリア
3. アプリを再読み込み

## セキュリティ注意事項

以下のファイルは `.gitignore` に含まれており、コミットされません：

- `.env.development`
- `.env.production`
- `scripts/sync/dev-user-mapping.json`

これらのファイルには認証トークンが含まれるため、**絶対にGitにコミットしないでください**。
