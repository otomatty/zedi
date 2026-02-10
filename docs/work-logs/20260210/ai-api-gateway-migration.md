# AI API: Lambda Function URL → API Gateway 移行作業ログ（2026-02-10）

## 概要

AI API（`/api/ai/models`, `/api/ai/usage`, `/api/ai/chat`）が Lambda Function URL 経由でアクセスできない問題を調査し、HTTP API Gateway + WebSocket API Gateway への移行を実施した。移行後に発生した CORS エラーおよび 500 Internal Server Error も解決した。

---

## 問題 1: Lambda Function URL で 403 Forbidden

### 症状
- `GET /api/ai/models` に対して 403 Forbidden が返される
- OPTIONS（プリフライト）は 200 を返すが、GET/POST は全て 403
- Lambda の CloudWatch ログにリクエストが一切記録されない（Lambda が invoke されていない）
- 別のテスト用 Lambda Function URL を作成しても同様に 403

### 原因
AWS アカウントレベルで **Lambda Function URL のパブリックアクセスがブロック**されていた。Lambda に到達する前に AWS 側で拒否されるため、Lambda ログにも何も残らなかった。

### 解決方針
Lambda Function URL を廃止し、**API Gateway** 経由に移行する。

- **HTTP API Gateway**: `GET /api/ai/models`, `GET /api/ai/usage`（既存の REST API 用 HTTP API GW を共有）
- **WebSocket API Gateway**: `POST /api/ai/chat`（SSE ストリーミングが必要なため、HTTP API GW では不可）

コスト面: HTTP API Gateway は約 $1.29/100万リクエストで、現在の利用規模では無視できるレベル。

---

## 問題 2: CORS プリフライトエラー

### 症状
移行後、ブラウザから `GET /api/ai/models` を呼ぶと CORS プリフライト（OPTIONS）が 401 で失敗する。

### 原因
既存の REST API モジュール（`modules/api/main.tf`）に定義されている `ANY /api/{proxy+}` ルートが JWT Authorizer 付きで存在しており、`OPTIONS /api/ai/models` がこのルートにマッチしてしまい、認証が要求されていた。

### 解決
AI API 用の OPTIONS ルートを明示的に追加（認証なし）:
- `OPTIONS /api/ai/models`
- `OPTIONS /api/ai/usage`

```hcl
# terraform/modules/ai-api/main.tf
resource "aws_apigatewayv2_route" "ai_models_options" {
  api_id    = var.api_id
  route_key = "OPTIONS /api/ai/models"
  target    = "integrations/${aws_apigatewayv2_integration.ai_http.id}"
}
```

修正後、OPTIONS は 204 No Content + 正しい CORS ヘッダーを返すようになった。

---

## 問題 3: 500 Internal Server Error（UUID 型不一致）

### 症状
- PowerShell から認証なしで `GET /api/ai/models` → 200 OK ✅
- ブラウザから認証ありで `GET /api/ai/models` → 500 Internal Server Error ❌

### 原因
CloudWatch ログに以下のエラーが記録されていた:

```
DatabaseErrorException: ERROR: operator does not exist: uuid = text
Hint: No operator matches the given name and argument types.
```

認証済みリクエストでは `verifyToken()` が成功し、Cognito `sub`（UUID 形式文字列）が返される。その後 `getSubscription(userId)` が呼ばれ、`subscriptions.user_id`（PostgreSQL `uuid` 型）と文字列パラメータの比較で型不一致エラーが発生。

RDS Data API の `db.ts` には UUID 自動検出ロジック（`isUuidString` + `typeHint: "UUID"`）があったが、UUID 正規表現が v1〜v5 のみ対応（`[1-5]` と `[89ab]` の制約）で、Cognito `sub` の形式にマッチしなかった。

### 解決

2つのアプローチを併用:

#### 1. UUID 正規表現の緩和（`db.ts`）

```typescript
// Before: v1-v5 UUID のみマッチ
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// After: 汎用的な 8-4-4-4-12 hex パターン
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
```

#### 2. SQL に明示的な CAST を追加

```sql
-- subscriptionService.ts
WHERE user_id = CAST(:userId AS uuid) AND status IN ('active', 'trialing')

-- usageService.ts (3箇所)
WHERE user_id = CAST(:userId AS uuid) AND year_month = :yearMonth
VALUES (CAST(:userId AS uuid), :modelId, ...)
VALUES (CAST(:userId AS uuid), :yearMonth, ...)
```

---

## 変更ファイル一覧

### Terraform（インフラ）
| ファイル | 変更内容 |
|---|---|
| `terraform/modules/ai-api/main.tf` | Function URL 削除、HTTP API GW integration/routes 追加、WebSocket API GW 追加、OPTIONS ルート追加 |
| `terraform/modules/ai-api/variables.tf` | `api_id` 変数追加 |
| `terraform/modules/ai-api/outputs.tf` | `function_url` → `websocket_url` に変更 |
| `terraform/main.tf` | `api_id = module.api.api_id` を ai_api モジュールに渡す |
| `terraform/outputs.tf` | `ai_api_function_url` → `ai_api_websocket_url` に変更 |

### Lambda（バックエンド）
| ファイル | 変更内容 |
|---|---|
| `lambda/src/index.ts` | HTTP/WebSocket 自動検出の統合ハンドラ、`handleHttpEvent` + `handleWebSocketEvent` 追加、エラーログ追加 |
| `lambda/src/middleware/auth.ts` | `verifyTokenString()` 追加（WebSocket 用の生トークン検証） |
| `lambda/src/routes/chat.ts` | `handleChatStreaming` のシグネチャを `sendFn` コールバック方式に変更 |
| `lambda/src/lib/db.ts` | UUID 正規表現を汎用パターンに緩和 |
| `lambda/src/services/subscriptionService.ts` | SQL に `CAST(:userId AS uuid)` 追加 |
| `lambda/src/services/usageService.ts` | SQL の userId パラメータ 3 箇所に `CAST(:userId AS uuid)` 追加 |
| `lambda/package.json` | `@aws-sdk/client-apigatewaymanagementapi` 追加 |
| `lambda/esbuild.config.mjs` | externals に同パッケージ追加 |

### フロントエンド
| ファイル | 変更内容 |
|---|---|
| `src/lib/aiService.ts` | WebSocket ストリーミング実装 (`callAIWithServerWS`)、HTTP フォールバック、`UserTier` 型修正 |
| `src/vite-env.d.ts` | `VITE_AI_WS_URL` 型宣言追加 |
| `.env.example` | `VITE_AI_WS_URL` 追加 |
| `.env.development` | HTTP API GW / WebSocket API GW の URL を設定 |

---

## 最終構成

```
ブラウザ
  ├─ GET  /api/ai/models ──→ HTTP API Gateway (xk2nkc4u6c) ──→ Lambda (zedi-dev-ai-api)
  ├─ GET  /api/ai/usage  ──→ HTTP API Gateway (xk2nkc4u6c) ──→ Lambda (zedi-dev-ai-api)
  └─ chat (streaming)    ──→ WebSocket API GW (oa2w0ntge4) ──→ Lambda (zedi-dev-ai-api)
```
