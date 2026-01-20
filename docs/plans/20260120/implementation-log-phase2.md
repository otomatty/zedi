# Phase 2 実装ログ

## 概要

AI実装リファクタリングのPhase 2（APIサーバー経由モードの実装）を行いました。ユーザーがAPIキーを設定せずにAIエージェント機能を利用できるようにするため、Cloudflare Workers上にAI APIサーバーを構築し、クライアント側の実装を完了しました。

## 実装期間

- 開始: 2026年1月20日
- 完了: 2026年1月20日

## 実装内容

### 1. AIエージェント用APIサーバーの作成 (`workers/ai-api/`)

#### 新規作成ファイル

- `workers/ai-api/src/index.ts` - メインエントリーポイント（27行）
- `workers/ai-api/src/routes/chat.ts` - チャットエンドポイント（114行）
- `workers/ai-api/src/services/aiProviders.ts` - AIプロバイダー実装（271行）
- `workers/ai-api/src/middleware/auth.ts` - 認証ミドルウェア（66行）
- `workers/ai-api/src/middleware/rateLimit.ts` - レート制限ミドルウェア（65行）
- `workers/ai-api/src/utils/sse.ts` - SSEユーティリティ（76行）
- `workers/ai-api/src/types/env.ts` - 環境変数型定義（13行）
- `workers/ai-api/src/types/api.ts` - API型定義（30行）
- `workers/ai-api/wrangler.toml` - Cloudflare Workers設定
- `workers/ai-api/package.json` - 依存関係
- `workers/ai-api/tsconfig.json` - TypeScript設定
- `workers/ai-api/.gitignore` - Git除外設定

#### 実装内容

##### 1.1 メインエントリーポイント (`src/index.ts`)

- HonoベースのAPIサーバー構築
- CORS設定（`hono/cors`を使用）
- `/api/ai/chat`エンドポイントへのルーティング

**実装例**:
```typescript
import { Hono } from "hono";
import { cors } from "hono/cors";
import chatRoute from "./routes/chat";

const app = new Hono<{ Bindings: Env }>();

app.use(
  "/api/*",
  cors({
    origin: (origin, c) => {
      const allowed = c.env.CORS_ORIGIN?.split(",").map((item) => item.trim());
      // CORS設定
    },
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "OPTIONS"],
  })
);

app.route("/api", chatRoute);
```

##### 1.2 認証ミドルウェア (`src/middleware/auth.ts`)

- Clerk JWTトークンの検証
- JWKSエンドポイントからの公開鍵取得（キャッシュ対応）
- ユーザーIDの抽出とコンテキストへの設定

**実装内容**:
- `jose`ライブラリを使用したJWT検証
- JWKSキャッシュによるパフォーマンス最適化
- 認証エラー時の適切なエラーレスポンス（401）

**環境変数**:
- `CLERK_JWKS_URL` - Clerk JWKSエンドポイント（必須）
- `CLERK_ISSUER` - JWT発行者（オプション）
- `CLERK_AUDIENCE` - JWTオーディエンス（オプション）

##### 1.3 レート制限ミドルウェア (`src/middleware/rateLimit.ts`)

- ユーザー単位のレート制限（認証済みユーザー）
- IP単位のレート制限（未認証リクエスト）
- メモリベースのレート制限ストア（Map使用）

**実装内容**:
- 時間窓ベースのレート制限（デフォルト: 1時間あたり100リクエスト）
- `Retry-After`ヘッダーの設定
- 429エラーレスポンス

**環境変数**:
- `RATE_LIMIT_WINDOW_SECONDS` - 時間窓（秒、デフォルト: 3600）
- `RATE_LIMIT_MAX_REQUESTS` - 最大リクエスト数（デフォルト: 100）

**注意**: 現在はメモリベースの実装のため、複数のWorkerインスタンス間で共有されません。本番環境ではCloudflare KVまたはDurable Objectsの使用を推奨します。

##### 1.4 AIプロバイダー実装 (`src/services/aiProviders.ts`)

**対応プロバイダー**:
- OpenAI（ストリーミング/非ストリーミング対応）
- Anthropic（ストリーミング/非ストリーミング対応、Web検索対応）
- Google AI（非ストリーミング対応、Google Search対応）

**実装関数**:
- `fetchOpenAI()` / `streamOpenAI()` - OpenAI API呼び出し
- `fetchAnthropic()` / `streamAnthropic()` - Anthropic API呼び出し
- `fetchGoogle()` - Google AI API呼び出し

**特徴**:
- ストリーミングレスポンスのSSE変換
- エラーハンドリング
- システムメッセージの適切な処理（Anthropic）

**環境変数**:
- `OPENAI_API_KEY` - OpenAI APIキー
- `ANTHROPIC_API_KEY` - Anthropic APIキー
- `GOOGLE_AI_API_KEY` - Google AI APIキー

##### 1.5 SSEユーティリティ (`src/utils/sse.ts`)

- Server-Sent Events（SSE）ストリームの作成
- SSEストリームの消費（クライアント側からの受信）

**実装内容**:
- `createSSEStream()` - SSEストリームの作成
- `consumeSSEStream()` - SSEストリームの消費

##### 1.6 チャットエンドポイント (`src/routes/chat.ts`)

**エンドポイント**: `POST /api/ai/chat`

**リクエスト形式**:
```typescript
{
  provider: "openai" | "anthropic" | "google";
  model: string;
  messages: Array<{ role: "user" | "assistant" | "system"; content: string }>;
  options?: {
    temperature?: number;
    maxTokens?: number;
    stream?: boolean;
    webSearchOptions?: { search_context_size: "medium" | "low" | "high" };
    useWebSearch?: boolean;
    useGoogleSearch?: boolean;
  };
}
```

**レスポンス形式**:
- 非ストリーミング: JSON形式
  ```typescript
  {
    content: string;
    finishReason?: string;
  }
  ```
- ストリーミング: SSE形式
  ```
  data: {"content": "..."}
  data: {"content": "..."}
  data: {"done": true, "finishReason": "stop"}
  ```

**実装内容**:
- リクエストバリデーション
- 認証・レート制限ミドルウェアの適用
- プロバイダー別の処理分岐
- ストリーミング/非ストリーミングの対応
- エラーハンドリング

### 2. クライアント側の実装 (`src/lib/aiService.ts`)

#### 変更内容

##### 2.1 `callAIWithServer()`関数の実装

**実装内容**:
- Clerk JWTトークンの取得（`window.Clerk`を使用）
- APIサーバーへのリクエスト送信
- ストリーミングレスポンスの処理（SSEパース）
- エラーハンドリング

**実装例**:
```typescript
async function callAIWithServer(
  request: AIServiceRequest,
  callbacks: AIServiceCallbacks,
  abortSignal?: AbortSignal
): Promise<void> {
  const apiBaseUrl = getAIAPIBaseUrl();
  if (!apiBaseUrl) {
    throw new Error("AI APIサーバーのURLが設定されていません");
  }

  if (request.provider === "ollama") {
    throw new Error("OllamaはAPIサーバー経由モードでは利用できません");
  }

  const token = await getClerkToken();
  if (!token) {
    throw new Error("AUTH_REQUIRED");
  }

  const response = await fetch(`${apiBaseUrl}/api/ai/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      provider: request.provider,
      model: request.model,
      messages: request.messages,
      options: request.options,
    }),
    signal: abortSignal,
  });

  // ストリーミング/非ストリーミングの処理
}
```

##### 2.2 `getClerkToken()`関数の実装

**実装内容**:
- `window.Clerk`からJWTトークンを取得
- `template: "turso"`を使用（既存のTurso認証と同じテンプレート）

**注意**: ブラウザ環境でのみ動作します。

##### 2.3 `callAIService()`関数の更新

**変更内容**:
- `api_server`モードの場合、`callAIWithServer()`を呼び出すように変更
- エラーメッセージの削除（実装完了のため）

### 3. 環境変数の追加

#### フロントエンド (`src/vite-env.d.ts`)

**追加**:
- `VITE_AI_API_BASE_URL` - AI APIのベースURL（オプション）

#### バックエンド（Cloudflare Workers）

**必須環境変数**:
- `CLERK_JWKS_URL` - Clerk JWKSエンドポイント
- `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` / `GOOGLE_AI_API_KEY` - 使用するプロバイダーのAPIキー

**オプション環境変数**:
- `CLERK_ISSUER` - JWT発行者
- `CLERK_AUDIENCE` - JWTオーディエンス
- `RATE_LIMIT_WINDOW_SECONDS` - レート制限の時間窓（秒）
- `RATE_LIMIT_MAX_REQUESTS` - レート制限の最大リクエスト数
- `CORS_ORIGIN` - CORS許可オリジン（カンマ区切り）

### 4. テストの修正 (`src/lib/aiService.test.ts`)

#### 変更内容

##### 4.1 モック実装の改善

**問題**: `vi.fn()`を使用したモックが警告を出力し、一部のテストが失敗していた

**対応**: クラスベースのモックに変更

**変更前**:
```typescript
vi.mock("openai", () => ({
  default: vi.fn(),
}));

vi.mocked(OpenAI).mockImplementation(() => mockClient as any);
```

**変更後**:
```typescript
let openAIMock: { chat: { completions: { create: ReturnType<typeof vi.fn> } } } | null = null;

vi.mock("openai", () => ({
  default: class OpenAI {
    constructor() {
      if (!openAIMock) {
        throw new Error("OpenAI mock is not configured");
      }
      return openAIMock;
    }
  },
}));

// テスト内で
openAIMock = mockClient;
```

**適用箇所**:
- OpenAI SDK
- Anthropic SDK
- Google GenAI SDK
- OllamaClient

##### 4.2 APIサーバー経由モードのテスト追加

**追加テスト**:
- `api_serverモードでAPIサーバーURLが未設定の場合はonErrorが呼ばれる`

**テスト内容**:
- APIサーバーURLが未設定の場合、`onError`コールバックが呼ばれることを確認
- `onComplete`が呼ばれないことを確認

## テスト結果

### テスト実行結果

```bash
$ bun run test

Test Files  12 passed (12)
Tests  157 passed (157)
```

### 成功しているテストカテゴリ

- ✅ 後方互換性: 4/4
- ✅ マイグレーション: 4/4
- ✅ エラーハンドリング: 5/5
- ✅ モード判定: 2/2
- ✅ 基本動作: 8/8
- ✅ API呼び出し詳細: 7/7（修正後）
- ✅ APIサーバー経由モード: 1/1

### 警告ログ（テストは通過）

- `contentUtils.test.ts` - 無効なJSONの処理テスト（意図的なエラーログ）
- `aiSettings.test.ts` - エラーハンドリングテスト（意図的なエラーログ）
- React Router Future Flag Warning（将来のバージョンへの警告）

## 実装上の課題と対応

### 1. Clerk JWTトークンの取得方法

**課題**: クライアント側でClerk JWTトークンを取得する方法

**対応**: `window.Clerk.session.getToken()`を使用

**制限**: ブラウザ環境でのみ動作（SSR非対応）

### 2. レート制限の実装

**課題**: Cloudflare Workers間でレート制限情報を共有する方法

**対応**: 
- 現在はメモリベースの実装（単一Workerインスタンス内でのみ有効）
- 本番環境ではCloudflare KVまたはDurable Objectsの使用を推奨

### 3. Google AIのストリーミング

**課題**: Google AI APIのストリーミングレスポンスの処理

**対応**: 
- 現在は非ストリーミングAPIを使用
- ストリーミングが必要な場合は、1チャンクとして送信

### 4. モック実装の複雑さ

**課題**: ESMモジュールのモックが複雑

**対応**: クラスベースのモックに変更し、テストの安定性を向上

## 既存機能への影響

### 確認済み

- ✅ 既存のユーザーAPIキーモードは正常に動作
- ✅ 既存のテストがすべて通過
- ✅ 後方互換性が確保されている

### 未確認（統合テスト推奨）

- ⚠️ 実際のAPIサーバー経由モードの動作（環境変数の設定が必要）
- ⚠️ 認証フローの動作（Clerk JWTの取得が必要）
- ⚠️ レート制限の動作（実際のリクエストが必要）

## 次のステップ（Phase 3）

1. **統合テストの実装**
   - 実際のAPIサーバー経由モードのテスト
   - 認証フローのテスト
   - レート制限のテスト

2. **本番環境へのデプロイ**
   - Cloudflare Workersへのデプロイ
   - 環境変数の設定
   - CORS設定の確認

3. **レート制限の改善**
   - Cloudflare KVまたはDurable Objectsの使用
   - 複数Workerインスタンス間での共有

4. **Google AIストリーミングの改善**
   - 真のストリーミングレスポンスの実装

5. **エラーハンドリングの強化**
   - より詳細なエラーメッセージ
   - リトライロジックの実装

## 関連ファイル

### 実装ファイル

- `workers/ai-api/src/index.ts` - メインエントリーポイント
- `workers/ai-api/src/routes/chat.ts` - チャットエンドポイント
- `workers/ai-api/src/services/aiProviders.ts` - AIプロバイダー実装
- `workers/ai-api/src/middleware/auth.ts` - 認証ミドルウェア
- `workers/ai-api/src/middleware/rateLimit.ts` - レート制限ミドルウェア
- `workers/ai-api/src/utils/sse.ts` - SSEユーティリティ
- `workers/ai-api/src/types/env.ts` - 環境変数型定義
- `workers/ai-api/src/types/api.ts` - API型定義
- `src/lib/aiService.ts` - AIサービス抽象化レイヤー（更新）
- `src/vite-env.d.ts` - 環境変数型定義（更新）

### テストファイル

- `src/lib/aiService.test.ts` - AIサービス回帰テスト（更新）

### ドキュメント

- `docs/plans/20260120/phase2-implementation-status.md` - Phase 2実装状況調査レポート
- `docs/plans/20260120/implementation-log-phase2.md` - 本ドキュメント

## 参考情報

- Phase 2の実装により、ユーザーがAPIキーを設定せずにAIエージェント機能を利用できるようになりました
- 認証・認可、レート制限が実装され、セキュアなAPIサーバーが構築されました
- 157のテストが成功し、既存機能への影響がないことを確認しました
