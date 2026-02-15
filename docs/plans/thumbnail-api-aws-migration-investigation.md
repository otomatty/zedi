# thumbnail-api AWS 移行 — 現状調査と仕様確認

## 1. 現状の thumbnail-api（Cloudflare Worker）

### 1.1 構成

| 項目 | 内容 |
|------|------|
| 場所 | `workers/thumbnail-api/` |
| フレームワーク | Hono |
| デプロイ | Wrangler (Cloudflare Workers) |

### 1.2 エンドポイント一覧

| メソッド | パス | 概要 | 認証 |
|----------|------|------|------|
| GET | `/api/image-search` | 画像検索（Google Custom Search） | なし |
| POST | `/api/image-generate` | 画像生成（Gemini） | なし |
| POST | `/api/thumbnail/commit` | Gyazo へアップロード | ヘッダー `x-gyazo-access-token` または env `GYAZO_ACCESS_TOKEN` |

### 1.3 環境変数（wrangler.toml / Env）

| 変数名 | 用途 |
|--------|------|
| `CORS_ORIGIN` | CORS 許可オリジン |
| `GOOGLE_GEMINI_API_KEY` | 画像生成（Gemini API） |
| `GOOGLE_CUSTOM_SEARCH_API_KEY` | 画像検索（Custom Search API） |
| `GOOGLE_CUSTOM_SEARCH_ENGINE_ID` | 画像検索（検索エンジン ID） |
| `GYAZO_ACCESS_TOKEN` | thumbnail/commit のフォールバック用 |
| `OPENVERSE_API_URL` 等 | 型定義のみ（現在未使用） |

### 1.4 画像検索の実装

- **使用している API**: **Google Custom Search API のみ**
- ファイル: `src/services/search/index.ts` → `google-custom-search.ts`
- Wikipedia / Wikimedia / Openverse は `env` 型にはあるが、`search/index.ts` では参照されておらず、実際には Custom Search のみ使用
- ページネーション: `cursor` を 1 始まりのページ番号として使用、最大 100 件まで（API 制限）
- レスポンス: `{ items: ImageSearchItem[], nextCursor?: string }`

### 1.5 画像生成の実装

- **使用 API**: Google Generative Language API（`generativelanguage.googleapis.com/v1beta`）
- **モデル**: `gemini-2.5-flash-image`（`src/services/generation/gemini.ts` で固定）
- リクエスト: `prompt`, `aspectRatio`（省略時 16:9）
- レスポンス: base64 データ URI の `imageUrl` と `mimeType`
- セーフティ設定: 4 カテゴリとも `BLOCK_MEDIUM_AND_ABOVE`

### 1.6 thumbnail/commit（Gyazo）

- 画像 URL または base64 データ URI を取得し、Gyazo にアップロード
- トークン: リクエストヘッダー `x-gyazo-access-token` または `Authorization: Bearer <token>`、未設定時は `GYAZO_ACCESS_TOKEN`（サーバー側デフォルト）

---

## 2. api_server 側（AWS ai-api）との対応関係

### 2.1 ai-api で使っている共通リソース

- **Secrets Manager**: `zedi-${env}-ai-provider-keys`
  - キー: `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, **`GOOGLE_AI_API_KEY`**
- **認証**: Cognito JWT（Lambda 内で `verifyToken`）
- **API Gateway**: 既存 HTTP API（`module.api.api_id`）にルートを追加
- **CORS**: モジュール変数 `cors_origin` で指定

### 2.2 キー名の違い

- 現状 Worker: 画像生成に **`GOOGLE_GEMINI_API_KEY`**
- ai-api Secrets: **`GOOGLE_AI_API_KEY`**
- Gemini のテキスト/チャットでは ai-api が `GOOGLE_AI_API_KEY` を使用。画像生成も同じキーで呼べるため、**AWS 移行後は `GOOGLE_AI_API_KEY` に統一**する想定で問題なし。

---

## 3. フロントエンドからの呼び出し

- **ベース URL**: `VITE_THUMBNAIL_API_BASE_URL`
- **画像検索**: `GET ${THUMBNAIL_API_BASE_URL}/api/image-search?query=...&limit=10&cursor=...`
- **画像生成**: `POST ${THUMBNAIL_API_BASE_URL}/api/image-generate`  
  Body: `{ prompt, aspectRatio?: "16:9", imageSize?: "2K" }`（`imageSize` は現状バックエンド未使用）
- **thumbnail/commit**: `TiptapEditor.tsx` から `POST ${THUMBNAIL_API_BASE_URL}/api/thumbnail/commit` で呼ばれている（選択画像を Gyazo にアップロードする処理）

---

## 4. 仕様確認したい点（質問）

以下の点について方針を決めたいです。

### Q1. thumbnail/commit（Gyazo アップロード）の扱い

- **画像検索**と**画像生成**のみ AWS に移行し、**thumbnail/commit は現状の Cloudflare Worker に残す**か、
- **thumbnail/commit も同じ Lambda（または同じ「thumbnail-api」モジュール）に含める**か、どちらにしますか？
- 含める場合、Gyazo トークンは Secrets Manager に「システム用デフォルト」として追加する想定でよいかも教えてください。

### Q2. 認証ポリシー

- 現状: 画像検索・画像生成は**認証なし**で呼ばれている。
- AWS 移行後:
  - **A)** api_server と同様に **Cognito JWT 必須**にする（未認証は 401）
  - **B)** 認証は**オプション**のまま（未認証でも呼べる）
  - **C)** その他（例: レート制限のみで認証は不要 など）

どれにしますか？

### Q3. ルーティングと URL 設計

- 既存の API Gateway（`module.api.api_id`）に、ai-api と同様にルートを追加する想定です。
  - 例: `GET /api/thumbnail/image-search`, `POST /api/thumbnail/image-generate`（必要なら `POST /api/thumbnail/commit` も）
- フロントの `VITE_THUMBNAIL_API_BASE_URL` は、**既存の REST API のベース URL と同じ**にし、パスだけ `/api/thumbnail/...` にする形でよいですか？（そうすると、thumbnail 用の別ドメイン/別 URL は不要になります）

### Q4. Google Custom Search のキー管理

- 画像検索用の **Google Custom Search API キー** と **検索エンジン ID** は、現在 Cloudflare の env にあります。
- AWS では次のどちらがよいですか？
  - **A)** 既存の **ai-provider-keys** 用 Secrets に `GOOGLE_CUSTOM_SEARCH_API_KEY` と `GOOGLE_CUSTOM_SEARCH_ENGINE_ID` を追加する（手動で Secret を更新）
  - **B)** thumbnail 用に**別の Secrets Manager シークレット**を用意し、そこに Custom Search 用キーのみ入れる

### Q5. レート制限・利用量

- ai-api では DynamoDB でレート制限・利用量を管理しています。
- 画像検索・画像生成について:
  - **同じ DynamoDB テーブルとロジックに統合**するか、
  - **当面はレート制限なし**で実装し、後で必要になったら追加するか、どちらを希望しますか？

### Q6. 画像生成モデル

- 現状どおり **`gemini-2.5-flash-image`** で固定でよいか、それとも設定可能（環境変数や Secrets でモデル名を変えられる）にしますか？

---

## 5. 実装方針（回答済み・仕様書に反映済み）

- 回答を反映した正式な仕様書は **`docs/specs/thumbnail-api-aws-spec.md`** を参照してください。
- 以下は方針の要約です。
  - **Terraform**: 新規モジュール `terraform/modules/thumbnail-api` を追加（Lambda + 既存 API Gateway へのルート追加 + 必要に応じて Secrets 参照）。
  - **Lambda**: Node.js 20、TypeScript（esbuild でバンドル）、画像検索・画像生成は現行 Worker と同ロジック。api_server と同様に **Secrets Manager の `GOOGLE_AI_API_KEY`** で Gemini を呼ぶ。
  - **画像検索**: Google Custom Search API をそのまま利用（キーは Q4 で決めた方法で注入）。
  - **画像生成**: モデルは `gemini-2.5-flash-image`（Q6 で変更する場合は対応）。
  - **認証・レート制限・Gyazo**: Q1, Q2, Q5 の回答に従う。

---

## 6. 参照ファイル一覧

| 役割 | パス |
|------|------|
| Worker エントリ | `workers/thumbnail-api/src/index.ts` |
| 画像検索ルート | `workers/thumbnail-api/src/routes/image-search.ts` |
| 画像生成ルート | `workers/thumbnail-api/src/routes/image-generate.ts` |
| thumbnail/commit ルート | `workers/thumbnail-api/src/routes/thumbnail-commit.ts` |
| 検索集約 | `workers/thumbnail-api/src/services/search/index.ts` |
| Google Custom Search | `workers/thumbnail-api/src/services/search/google-custom-search.ts` |
| 画像生成（Gemini） | `workers/thumbnail-api/src/services/generation/gemini.ts` |
| Gyazo アップロード | `workers/thumbnail-api/src/services/gyazo.ts` |
| 型定義 | `workers/thumbnail-api/src/types/api.ts`, `env.ts` |
| ai-api Terraform | `terraform/modules/ai-api/main.tf` |
| ai-api Lambda ハンドラ | `terraform/modules/ai-api/lambda/src/index.ts` |
| フロント呼び出し | `src/components/editor/TiptapEditor/EditorRecommendationBar.tsx` |
