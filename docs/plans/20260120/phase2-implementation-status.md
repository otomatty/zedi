# Phase 2 実装状況調査レポート

## 📋 調査日時
2026年1月20日

## 🎯 Phase 2の目標
APIサーバー経由モードの実装により、ユーザーがAPIキーを設定せずにAIエージェント機能を利用できるようにする。

## 📊 現在の実装状況

### ✅ 完了している項目（Phase 1）

1. **型定義の拡張**
   - `APIMode`型の定義（`"user_api_key" | "api_server"`）
   - `AISettings`インターフェースに`apiMode`フィールド追加
   - 後方互換性のためのオプショナル設定

2. **AIサービス抽象化レイヤー**
   - `src/lib/aiService.ts`の作成（378行）
   - `getEffectiveAPIMode()`関数の実装
   - `shouldUseUserAPIKey()`関数の実装
   - ユーザーAPIキーモードの実装（4プロバイダー対応）

3. **後方互換性処理**
   - `src/lib/aiSettings.ts`にマイグレーション処理追加
   - 既存設定の自動判定とマイグレーション

### ⏳ 未実装の項目（Phase 2で実装予定）

1. **APIサーバー経由モードの実装**
   - ❌ `aiService.ts`の`api_server`モード処理（現在はエラーを投げるのみ）
   - ❌ バックエンドAPIエンドポイント（`/api/ai/chat`）
   - ❌ ストリーミングレスポンスの処理

2. **認証・認可**
   - ❌ Clerk JWTトークンの検証
   - ❌ ユーザー認証ミドルウェア
   - ❌ 認証エラーハンドリング

3. **レート制限**
   - ❌ ユーザー単位のレート制限
   - ❌ IP単位のレート制限
   - ❌ レート制限エラーレスポンス

4. **統合テスト**
   - ❌ APIサーバー経由モードのテスト
   - ❌ 認証フローのテスト
   - ❌ レート制限のテスト

## 🏗️ 既存のインフラストラクチャ

### 1. バックエンドAPIサーバー構造

**既存実装**: `workers/thumbnail-api/`
- **フレームワーク**: Hono
- **プラットフォーム**: Cloudflare Workers
- **構造**:
  ```
  workers/thumbnail-api/
  ├── src/
  │   ├── index.ts          # メインエントリーポイント
  │   ├── routes/           # ルート定義
  │   ├── services/         # ビジネスロジック
  │   ├── types/            # 型定義
  │   └── utils/            # ユーティリティ
  ├── wrangler.toml         # Cloudflare Workers設定
  └── package.json
  ```

**参考実装パターン**:
- CORS設定済み（`hono/cors`）
- 環境変数による設定管理（`Env`型）
- エラーハンドリングの実装例あり

### 2. 認証システム

**認証プロバイダー**: Clerk
- **JWT取得方法**: `getToken({ template: "turso" })`
- **使用箇所**: 
  - `src/lib/turso.ts` - Tursoデータベース認証
  - `src/hooks/useTurso.ts` - 認証済みクライアント取得

**参考実装**:
```typescript
// src/lib/turso.ts
export async function createAuthenticatedTursoClient(
  jwtToken: string
): Promise<Client> {
  // JWTトークンを使用して認証
}
```

### 3. 環境変数管理

**フロントエンド**:
- `VITE_THUMBNAIL_API_BASE_URL` - サムネイルAPIのベースURL
- パターン: `VITE_*` プレフィックスで環境変数を公開

**バックエンド（Cloudflare Workers）**:
- `wrangler.toml`で環境変数を定義
- `Env`型で型安全性を確保

### 4. API呼び出しパターン

**既存の実装例**:
```typescript
// src/components/editor/TiptapEditor/EditorRecommendationBar.tsx
const THUMBNAIL_API_BASE_URL = import.meta.env.VITE_THUMBNAIL_API_BASE_URL || "";

fetch(`${THUMBNAIL_API_BASE_URL}/api/image-search?${params.toString()}`)
```

## 📝 Phase 2実装計画

### ステップ1: AIエージェント用APIサーバーの作成

**新規作成ファイル**:
- `workers/ai-api/src/index.ts` - メインエントリーポイント
- `workers/ai-api/src/routes/chat.ts` - チャットエンドポイント
- `workers/ai-api/src/services/ai/` - AIプロバイダー実装
- `workers/ai-api/src/middleware/auth.ts` - 認証ミドルウェア
- `workers/ai-api/src/middleware/rateLimit.ts` - レート制限ミドルウェア
- `workers/ai-api/src/types/env.ts` - 環境変数型定義
- `workers/ai-api/src/types/api.ts` - API型定義
- `workers/ai-api/wrangler.toml` - Cloudflare Workers設定
- `workers/ai-api/package.json` - 依存関係

**実装内容**:
1. HonoベースのAPIサーバー構築
2. CORS設定
3. 認証ミドルウェア（Clerk JWT検証）
4. レート制限ミドルウェア
5. `/api/ai/chat`エンドポイント実装
6. ストリーミングレスポンス対応

### ステップ2: クライアント側の実装

**修正ファイル**:
- `src/lib/aiService.ts` - `api_server`モードの実装

**実装内容**:
1. `callAIWithServer()`関数の実装
2. Clerk JWTトークンの取得
3. APIサーバーへのリクエスト送信
4. ストリーミングレスポンスの処理
5. エラーハンドリング

### ステップ3: 環境変数の設定

**追加が必要な環境変数**:
- `VITE_AI_API_BASE_URL` - AI APIのベースURL（フロントエンド）
- `CLERK_JWKS_URL` - Clerk JWKSエンドポイント（バックエンド）
- `OPENAI_API_KEY` - OpenAI APIキー（バックエンド）
- `ANTHROPIC_API_KEY` - Anthropic APIキー（バックエンド）
- `GOOGLE_AI_API_KEY` - Google AI APIキー（バックエンド）

### ステップ4: 統合テスト

**テストファイル**:
- `src/lib/aiService.test.ts` - APIサーバー経由モードのテスト追加
- `workers/ai-api/src/routes/chat.test.ts` - エンドポイントのテスト

## 🔍 技術的な検討事項

### 1. Clerk JWT検証

**課題**: Cloudflare WorkersでClerk JWTを検証する方法

**解決策**:
- JWKSエンドポイントから公開鍵を取得
- JWTトークンを検証
- または、ClerkのSDKを使用（利用可能な場合）

**参考実装**:
- `src/lib/turso.ts`でJWTを使用しているが、検証はTurso側で実施
- Cloudflare Workers側で検証する必要がある

### 2. ストリーミングレスポンス

**課題**: Server-Sent Events (SSE) またはチャンクレスポンスの実装

**解決策**:
- Honoのストリーミング機能を使用
- `ReadableStream`を使用してチャンクを送信
- クライアント側で`fetch`の`body`をストリーミング読み取り

### 3. レート制限

**課題**: ユーザー単位のレート制限を実装

**解決策**:
- Cloudflare KVまたはDurable Objectsを使用
- リクエスト数をカウント
- 時間窓（例: 1時間あたりN回）で制限

### 4. エラーハンドリング

**考慮事項**:
- 認証エラー（401）
- レート制限エラー（429）
- APIプロバイダーエラー（500）
- ネットワークエラー

## 📚 参考ドキュメント

- [Phase 1実装ログ](./implementation-log-phase1.md)
- [AIエージェント機能仕様](./ai-agent-feature.md)
- [AI実装リファクタリング計画](./ai-implementation-refactoring.md)

## 🎯 次のアクション

1. **AIエージェント用APIサーバーの作成**
   - `workers/ai-api/`ディレクトリの作成
   - 基本的なHonoアプリケーションのセットアップ
   - 認証ミドルウェアの実装

2. **クライアント側の実装**
   - `aiService.ts`の`api_server`モード実装
   - 環境変数の設定

3. **統合テスト**
   - エンドポイントのテスト
   - 認証フローのテスト
