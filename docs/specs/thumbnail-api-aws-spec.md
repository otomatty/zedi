# Thumbnail API AWS 移行 仕様書

## 1. 概要

### 1.1 目的

- Cloudflare Worker で提供している thumbnail-api を AWS 上に移行する。
- 画像検索・画像生成・画像保存（commit）を 1 本の Lambda で提供し、認証は Cognito JWT 必須とする。
- 画像保存の標準ストレージを **S3** とし、ユーザーごとのストレージ容量制限を設け、無料／有料で差別化する。

### 1.2 スコープ

| 機能 | 現状 (Worker) | 移行後 (AWS Lambda) |
|------|----------------|----------------------|
| 画像検索 | GET /api/image-search (Google Custom Search) | 同一ロジック・同一 API |
| 画像生成 | POST /api/image-generate (Gemini) | 同一ロジック・api_server と同じキー |
| 画像保存 (commit) | POST /api/thumbnail/commit (Gyazo) | **S3 を標準**。ユーザー別クォータ（free/pro） |

- 移行後は **Gyazo は標準経路から外す**。commit は S3 への保存のみを提供する。
- レート制限は ai-api と **同じ DynamoDB テーブル** に統合する。

---

## 2. アーキテクチャ

### 2.1 構成図

```
[ クライアント ]
       | Authorization: Bearer <Cognito JWT>
       v
[ API Gateway HTTP API ]  (既存 api_id にルート追加)
       | GET  /api/thumbnail/image-search
       | POST /api/thumbnail/image-generate
       | POST /api/thumbnail/commit
       | OPTIONS (CORS)
       v
[ Thumbnail API Lambda ]
       |
       +---> Secrets Manager (thumbnail 用: Custom Search)
       +---> Secrets Manager (ai 用: GOOGLE_AI_API_KEY for Gemini)
       +---> DynamoDB (レート制限・ai-api と同一テーブル)
       +---> Aurora (subscription 取得・ストレージ使用量・オブジェクトメタデータ)
       +---> S3 (サムネイル画像保存)
       +---> Google Custom Search API
       +---> Google Gemini API (画像生成)
```

### 2.2 URL 設計

- **ベース URL**: 既存 REST API と同じ（`VITE_AI_API_BASE_URL` と同一ベースでよい。フロントでは `VITE_THUMBNAIL_API_BASE_URL` を廃止し、REST API ベース URL に統一するか、同一値で設定する）。

| メソッド | パス | 説明 |
|----------|------|------|
| GET | /api/thumbnail/image-search | 画像検索 |
| POST | /api/thumbnail/image-generate | 画像生成 |
| POST | /api/thumbnail/commit | 画像を S3 に保存 |
| OPTIONS | 上記各パス | CORS プリフライト |

- API Gateway では、既存の `ANY /api/{proxy+}` より**具体的なルートを優先**するため、`GET /api/thumbnail/image-search` 等を先に登録し、Thumbnail Lambda に転送する。

---

## 3. 認証・認可

- **全エンドポイント**: **Cognito JWT 必須**。
  - `Authorization: Bearer <id_token>` を検証し、`sub` を `userId` として利用する。
  - 未認証・無効トークンは `401 Unauthorized`。
- レート制限: ai-api と同一の DynamoDB テーブルで **同一キー**（`user:{userId}:{windowKey}`）をインクリメントするため、画像検索・画像生成・commit も含めた「AI 系＋サムネイル系」の合計で 120 リクエスト/時 の制限となる。

---

## 4. エンドポイント仕様

### 4.1 GET /api/thumbnail/image-search

**概要**: クエリに基づき画像を検索する（Google Custom Search API）。

**リクエスト**

- ヘッダー: `Authorization: Bearer <Cognito JWT>`
- クエリ:
  - `query` (必須): 検索文言
  - `limit` (任意): 1〜30、デフォルト 10
  - `cursor` (任意): ページ番号（1 始まり）、デフォルト 1

**レスポンス** (200)

```json
{
  "items": [
    {
      "id": "string",
      "previewUrl": "string",
      "imageUrl": "string",
      "alt": "string",
      "sourceName": "string",
      "sourceUrl": "string",
      "authorName": "string (optional)",
      "authorUrl": "string (optional)"
    }
  ],
  "nextCursor": "string (optional)"
}
```

**エラー**

- 400: query なし
- 401: 認証エラー
- 429: レート制限超過
- 500: Custom Search API エラー 等

**シークレット**: Thumbnail 用 Secrets Manager の `GOOGLE_CUSTOM_SEARCH_API_KEY`, `GOOGLE_CUSTOM_SEARCH_ENGINE_ID` を使用する。

---

### 4.2 POST /api/thumbnail/image-generate

**概要**: プロンプトから画像を生成する（Gemini）。

**リクエスト**

- ヘッダー: `Authorization: Bearer <Cognito JWT>`
- Body (JSON):
  - `prompt` (必須): 生成用テキスト
  - `aspectRatio` (任意): 例 "16:9"、デフォルト "16:9"

**レスポンス** (200)

```json
{
  "imageUrl": "data:image/png;base64,...",
  "mimeType": "image/png"
}
```

**エラー**

- 400: prompt なし
- 401: 認証エラー
- 429: レート制限超過
- 500: Gemini API エラー 等

**シークレット・モデル**: ai-api と同じ Secrets Manager（`GOOGLE_AI_API_KEY`）を使用。モデルは **`gemini-2.5-flash-image`** 固定。

---

### 4.3 POST /api/thumbnail/commit

**概要**: 指定した画像（URL または data URI）を S3 に保存し、永続 URL を返す。ユーザーごとのストレージクォータ（free/pro）をチェックする。

**リクエスト**

- ヘッダー: `Authorization: Bearer <Cognito JWT>`
- Body (JSON):
  - `sourceUrl` (必須): 画像の URL または `data:image/...;base64,...` のデータ URI
  - `title` (任意): 保存時のタイトル（メタデータ・ファイル名に利用可能）
  - `fallbackUrl` (任意): sourceUrl 取得失敗時の代替 URL（従来互換）

**処理フロー**

1. JWT 検証 → userId 取得
2. レート制限チェック（同一 DynamoDB）
3. subscriptions から plan 取得（`free` / `pro`）
4. ティア別ストレージクォータ取得（free: 例 10MB、pro: 例 100MB）
5. 当該ユーザーの現在の使用量を DB から取得
6. アップロード対象の画像サイズを取得（sourceUrl を fetch するか data URI をデコード）
7. `現在使用量 + 今回サイズ > クォータ` なら `403`（クォータ超過）
8. S3 に PUT: キー `users/{userId}/thumbnails/{uuid}.{ext}`
9. メタデータ用テーブルに 1 行追加（user_id, s3_key, size_bytes, created_at）
10. 返却用 URL を生成（CloudFront または S3 の URL。後述）

**レスポンス** (200)

```json
{
  "imageUrl": "https://<cloudfront-or-api>/users/<userId>/thumbnails/<uuid>.png",
  "provider": "s3"
}
```

**エラー**

- 400: sourceUrl なし または 画像でない
- 401: 認証エラー
- 403: ストレージクォータ超過
- 429: レート制限超過
- 500: 取得/アップロード失敗 等

**補足**

- 移行後は **Gyazo トークンは不要**。フロントは commit を呼ぶ際に JWT のみ送る。
- 既存の `storageProviderId: "gyazo"` に代わり、`storageProviderId: "s3"`（または "zedi"）を返す想定。

---

## 5. S3 ストレージ設計

### 5.1 バケット

- **バケット名**: `zedi-${environment}-thumbnails-${account_id}` など、環境ごとに 1 バケット。
- **アクセス**: 非公開。Lambda のみ PutObject / GetObject / DeleteObject 可能。
- **読み取り公開**: CloudFront 経由で署名付き URL または公開キャッシュのどちらかで提供（本仕様では「返却 URL は CloudFront のオブジェクト URL」を想定。署名の要否は運用で決定）。

### 5.2 オブジェクトキー

- 形式: `users/{userId}/thumbnails/{uuid}.{ext}`
  - `userId`: Cognito `sub`（UUID）
  - `uuid`: 重複回避用の UUID
  - `ext`: 元画像の MIME に基づく拡張子（png, jpeg, webp 等）

### 5.3 ユーザー別クォータ（無料／有料の差別化）

- **ティア**: 既存の `subscriptions.plan` に準拠（`free` / `pro`）。
- **クォータ例**（設定値は Terraform または DB で管理）:
  - free: **10 MB**
  - pro: **100 MB**
- 単位は「1 ユーザーあたりの合計バイト数」。同一ユーザーの全サムネイルの合計がクォータを超えたら commit を 403 とする。

### 5.4 使用量の管理

- **保存場所**: Aurora にテーブルを用意し、オブジェクトごとのサイズを記録する。
- **推奨スキーマ**:
  - `thumbnail_objects`:  
    - `id` (UUID, PK), `user_id` (UUID), `s3_key` (VARCHAR), `size_bytes` (BIGINT), `created_at` (TIMESTAMPTZ)
  - ユーザーごとの使用量: `SELECT SUM(size_bytes) FROM thumbnail_objects WHERE user_id = :userId`
- commit 時: アップロード成功後に上記テーブルに 1 行 INSERT。削除機能を将来つける場合は、DELETE 時に該当行を削除し、使用量から減算する。

### 5.5 クォータ値の管理

- **案 A**: Aurora に `thumbnail_tier_quotas` テーブル（`tier`, `storage_limit_bytes`）を用意し、free / pro の上限を DB で管理。
- **案 B**: Lambda の環境変数または Terraform で固定値（free: 10MB, pro: 100MB）を渡す。
- 仕様上は **案 A を推奨**（将来的にティアやプランが増えても拡張しやすい）。

### 5.6 画像の配信（読み取り）

- S3 は非公開のため、クライアントが画像を表示するには **CloudFront** 経由で配信する。
- **方式**: CloudFront 分布を S3 オリジンにし、Origin Access Identity (OAI) または Origin Access Control (OAC) で S3 へのアクセスを制限。CloudFront の URL は「公開読み取り」とする（キャッシュで配信）。対象パスを `users/*` に限定するなど、必要に応じて WAF や署名付き URL で制御可能（初版は公開読みでよいか、運用で判断）。
- 返却する `imageUrl` は `https://<cloudfront-domain>/users/<userId>/thumbnails/<uuid>.<ext>` 形式とする。

---

## 6. レート制限

- **テーブル**: ai-api が利用している DynamoDB のレート制限テーブルをそのまま利用する。
- **キー**: `user:{userId}:{windowKey}`（1 時間ウィンドウ）。
- **上限**: 既存と同様 120 リクエスト/時（画像検索・画像生成・commit を含む合計）。
- Thumbnail Lambda は、ai-api と同じテーブル名を環境変数で受け取り、同一の `checkRateLimit(userId, env)` に相当する処理を行う。

---

## 7. シークレット

### 7.1 Thumbnail 用 Secrets Manager（新規）

- **名前**: `zedi-${environment}-thumbnail-keys` など。
- **想定キー**:
  - `GOOGLE_CUSTOM_SEARCH_API_KEY`
  - `GOOGLE_CUSTOM_SEARCH_ENGINE_ID`
- 画像検索のみで使用。Terraform でシークレットリソースを作成し、値は手動または CI で更新する。

### 7.2 AI 用 Secrets Manager（既存）

- 画像生成では **既存の ai-api 用シークレット**（`GOOGLE_AI_API_KEY`）を参照する。
- Thumbnail Lambda の IAM に、当該シークレットの `GetSecretValue` を付与する。

---

## 8. データベース（Aurora）

### 8.1 既存

- `subscriptions`: 既存のまま。`getSubscription(userId)` で plan 取得。
- 接続情報・認証は既存の RDS Data API / Secrets を Thumbnail Lambda からも利用する。

### 8.2 新規テーブル

**thumbnail_tier_quotas**

| カラム | 型 | 説明 |
|--------|-----|------|
| tier | VARCHAR(32) PK | 'free', 'pro' |
| storage_limit_bytes | BIGINT | 上限バイト数 |

**thumbnail_objects**

| カラム | 型 | 説明 |
|--------|-----|------|
| id | UUID PK | オブジェクト ID |
| user_id | UUID | 所有者（Cognito sub） |
| s3_key | VARCHAR(512) | S3 オブジェクトキー |
| size_bytes | BIGINT | サイズ |
| created_at | TIMESTAMPTZ | 作成日時 |

- `user_id` にインデックスを張り、`SUM(size_bytes) WHERE user_id = ?` を高速化する。

**DDL 例**

```sql
CREATE TABLE thumbnail_tier_quotas (
  tier                VARCHAR(32) PRIMARY KEY,
  storage_limit_bytes BIGINT NOT NULL
);

CREATE TABLE thumbnail_objects (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL,
  s3_key     VARCHAR(512) NOT NULL,
  size_bytes BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_thumbnail_objects_user_id ON thumbnail_objects (user_id);
```

### 8.3 初期データ（thumbnail_tier_quotas）

```sql
INSERT INTO thumbnail_tier_quotas (tier, storage_limit_bytes) VALUES
  ('free', 10 * 1024 * 1024),   -- 10 MB
  ('pro',  100 * 1024 * 1024);  -- 100 MB
```

---

## 9. フロントエンド変更

### 9.1 ベース URL

- Thumbnail 用の呼び出しを **REST API のベース URL** に統一する。
  - 例: `VITE_AI_API_BASE_URL` と同一のベースを使い、パスを `/api/thumbnail/image-search` 等にする。
  - または `VITE_THUMBNAIL_API_BASE_URL` を本番では REST API の URL と同じに設定する。

### 9.2 認証

- 全リクエストに `Authorization: Bearer <id_token>` を付与する（既存の `getIdToken()` 利用）。

### 9.3 commit の変更

- **リクエスト**: `X-Gyazo-Access-Token` を送らない。Body は `sourceUrl`, `title`, `fallbackUrl` のままでも可。
- **レスポンス**: `imageUrl` は S3/CloudFront の URL。`provider` は `"s3"`。
- **保存先表示**: `storageProviderId` を `"s3"`（または "zedi"）にし、必要に応じて設定画面で「Gyazo トークン」を必須から外す。

### 9.4 ストレージ設定 UI

- 「画像の保存先」として S3（標準）をデフォルトにし、Gyazo はオプションまたは廃止する方針に合わせて UI を変更する（詳細は別タスクでも可）。

---

## 10. Terraform モジュール概要

### 10.1 新規モジュール

- **パス**: `terraform/modules/thumbnail-api/`
- **主なリソース**:
  - Lambda 関数（Node.js 20, TypeScript ビルド）
  - IAM ロール（Secrets Manager 2 種、DynamoDB、Aurora/RDS Data API、S3、CloudWatch Logs）
  - API Gateway ルート追加（既存 `api_id` に GET/POST/OPTIONS を追加、統合は Thumbnail Lambda）
  - S3 バケット（thumbnails 用、非公開）
  - Thumbnail 用 Secrets Manager シークレット（空の初期値、手動更新）
  - （オプション）CloudFront 分布と OAI（S3 配信用）

### 10.2 変数（例）

- `environment`, `tags`
- `api_id`（既存 API Gateway）
- `cognito_user_pool_id`
- `db_credentials_secret_arn`, `aurora_cluster_arn`, `aurora_database_name`
- `rate_limit_table_name`（ai-api の DynamoDB テーブル名）
- `ai_secrets_arn`（GOOGLE_AI_API_KEY 用）
- `cors_origin`

### 10.3 マイグレーション

- Aurora に `thumbnail_tier_quotas` と `thumbnail_objects` を作成する SQL を用意し、適用順序をドキュメントに記載する。

---

## 11. エラーレスポンス統一

- 本文は JSON: `{ "error": "message" }`。
- ステータスコード:
  - 400: バリデーションエラー
  - 401: 認証エラー（AUTH_REQUIRED / UNAUTHORIZED）
  - 403: クォータ超過（STORAGE_QUOTA_EXCEEDED）等
  - 404: リソースなし
  - 429: レート制限（RATE_LIMIT_EXCEEDED）
  - 500: サーバーエラー

---

## 12. まとめ

| 項目 | 内容 |
|------|------|
| 認証 | Cognito JWT 必須 |
| 画像検索 | Google Custom Search、Thumbnail 用 Secrets |
| 画像生成 | Gemini gemini-2.5-flash-image、ai 用 Secrets |
| 画像保存 | S3 標準、ユーザー別クォータ（free/pro）、Aurora で使用量管理 |
| レート制限 | ai-api と同一 DynamoDB |
| URL | GET/POST /api/thumbnail/image-search, image-generate, commit |

この仕様に基づき、Terraform モジュールと Lambda 実装を行う。
