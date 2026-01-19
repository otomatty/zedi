# Google Custom Search APIとGemini API統合実装

**日付**: 2026-01-18  
**ステータス**: 完了  
**関連機能**: サムネイル検索・生成機能

## 概要

既存のWikipedia/Wikimedia/Openverseベースの検索機能を廃止し、Google Custom Search APIとGemini API（Imagen）を使用した新しい実装に置き換えました。

**変更内容**:
1. Google Custom Search APIによる一般Web画像検索
2. Gemini API（Imagen）による画像生成機能
3. base64データURIのGyazoアップロード対応

---

## 実装内容

### 1. Google Custom Search APIの統合

#### 1.1 新規ファイル
- `workers/thumbnail-api/src/services/search/google-custom-search.ts`
  - Google Custom Search APIを使用した画像検索実装

#### 1.2 更新ファイル
- `workers/thumbnail-api/src/services/search/index.ts`
  - 既存のWikipedia/Wikimedia/Openverse検索をGoogle Custom Searchに置き換え

#### 1.3 機能
- 一般Web画像の検索
- ページング対応（最大100件まで）
- 画像サイズ・タイプのフィルタリング（large, photo）
- SafeSearch有効

---

### 2. Gemini API（Imagen）の統合

#### 2.1 新規ファイル
- `workers/thumbnail-api/src/services/generation/gemini.ts`
  - Gemini APIを使用した画像生成実装
- `workers/thumbnail-api/src/routes/image-generate.ts`
  - 画像生成エンドポイント

#### 2.2 機能
- テキストプロンプトから画像生成
- アスペクト比の指定（デフォルト: 16:9）
- 画像サイズの指定（デフォルト: 2K）
- 安全性フィルタリング

---

### 3. base64データURIのGyazoアップロード対応

#### 3.1 更新ファイル
- `workers/thumbnail-api/src/services/gyazo.ts`
  - base64データURIを直接処理できるように拡張

#### 3.2 機能
- データURIの検出と処理
- base64デコード
- MIMEタイプの自動判定

---

### 4. フロントエンドの更新

#### 4.1 更新ファイル
- `src/components/editor/TiptapEditor/EditorRecommendationBar.tsx`
  - 画像生成ボタンの追加
  - 生成モードの追加

#### 4.2 機能
- 「AIで生成」ボタンの追加
- 画像生成中のローディング表示
- エラーハンドリング

---

### 5. 環境変数の追加

#### 5.1 更新ファイル
- `workers/thumbnail-api/src/types/env.ts`

#### 5.2 必要な環境変数
```typescript
GOOGLE_CUSTOM_SEARCH_API_KEY: string;      // Google Custom Search APIキー
GOOGLE_CUSTOM_SEARCH_ENGINE_ID: string;    // カスタム検索エンジンID
GOOGLE_GEMINI_API_KEY: string;             // Gemini APIキー
```

---

## API仕様

### 画像検索エンドポイント

**変更なし**（既存のエンドポイントを継続使用）

```
GET /api/image-search?query={query}&cursor={cursor}&limit={limit}
```

**レスポンス**: 変更なし（既存の形式を維持）

---

### 画像生成エンドポイント（新規）

```
POST /api/image-generate
```

**リクエストボディ**:
```json
{
  "prompt": "画像の説明文",
  "aspectRatio": "16:9",  // オプション、デフォルト: "16:9"
  "imageSize": "2K"       // オプション、デフォルト: "2K"
}
```

**レスポンス**:
```json
{
  "imageUrl": "data:image/png;base64,...",
  "mimeType": "image/png"
}
```

---

## 設定手順

**詳細な設定手順は、別ドキュメントを参照してください:**
- **`docs/guides/google-apis-setup-guide.md`** - ステップバイステップの設定ガイド

### 概要

1. **Google Custom Search APIの設定**
   - Google Cloudプロジェクトの作成
   - Custom Search APIの有効化
   - APIキーの作成
   - カスタム検索エンジン（CSE）の作成（画像検索を有効化）

2. **Gemini APIの設定**
   - Google AI StudioでAPIキーを作成

3. **環境変数の設定**
   - ローカル開発: `.dev.vars`ファイルに設定
   - 本番環境: Cloudflare Dashboardで設定

詳細は上記のガイドドキュメントを参照してください。

---

## コスト

### Google Custom Search API
- **無料枠**: 1日100リクエスト（月約3,000リクエスト）
- **有料**: $5 / 1,000リクエスト

### Gemini API (Imagen)
- **Imagen 4 Fast**: $0.02 / 画像
- **Imagen 4**: $0.04 / 画像
- **Imagen 4 Ultra**: $0.06 / 画像

**使用モデル**: `imagen-4.0-fast-generate-001`（$0.02/画像）

---

## 削除された機能

以下のファイルは使用されなくなりましたが、後方互換性のため残しています:

- `workers/thumbnail-api/src/services/search/wikipedia.ts`
- `workers/thumbnail-api/src/services/search/wikimedia.ts`
- `workers/thumbnail-api/src/services/search/openverse.ts`

将来的に削除予定です。

---

## 変更ファイル一覧

### バックエンド（Workers API）

1. **新規ファイル**:
   - `workers/thumbnail-api/src/services/search/google-custom-search.ts`
   - `workers/thumbnail-api/src/services/generation/gemini.ts`
   - `workers/thumbnail-api/src/routes/image-generate.ts`

2. **更新ファイル**:
   - `workers/thumbnail-api/src/services/search/index.ts`
   - `workers/thumbnail-api/src/services/gyazo.ts`
   - `workers/thumbnail-api/src/types/env.ts`
   - `workers/thumbnail-api/src/types/api.ts`
   - `workers/thumbnail-api/src/index.ts`

### フロントエンド

3. **更新ファイル**:
   - `src/components/editor/TiptapEditor/EditorRecommendationBar.tsx`

---

## テスト

### 画像検索のテスト

```bash
curl "http://localhost:8787/api/image-search?query=sunset&limit=10"
```

### 画像生成のテスト

```bash
curl -X POST "http://localhost:8787/api/image-generate" \
  -H "Content-Type: application/json" \
  -d '{"prompt": "A beautiful sunset over the ocean"}'
```

---

## 今後の改善候補

1. **エラーハンドリングの強化**
   - レート制限の処理
   - タイムアウトの処理
   - リトライロジック

2. **キャッシュ機能**
   - 同じクエリで生成された画像をキャッシュ
   - 検索結果のキャッシュ

3. **プロンプトの最適化**
   - ページタイトルからより適切なプロンプトを生成
   - プロンプトテンプレートの追加

4. **画像品質の選択**
   - ユーザーが画像サイズやアスペクト比を選択可能に

---

## 参考資料

- **設定ガイド**: `docs/guides/google-apis-setup-guide.md` - 詳細な設定手順
- **Google Custom Search API**: https://developers.google.com/custom-search/v1/overview
- **Gemini API (Imagen)**: https://ai.google.dev/gemini-api/docs/imagen
- **コスト比較**: `docs/specs/image-search-and-generation-options.md`
