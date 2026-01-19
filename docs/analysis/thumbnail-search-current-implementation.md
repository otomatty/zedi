# サムネイル検索機能 - 現在の実装状況調査

**調査日**: 2026-01-18  
**目的**: Google画像検索レベルの結果を実現するための現状把握

---

## 1. アーキテクチャ概要

### 1.1 システム構成

```
フロントエンド (React)
  ↓ GET /api/image-search?query=...&cursor=...&limit=10
Cloudflare Workers API (Hono)
  ↓ 複数ソースから検索
検索ソース: Wikipedia, Wikimedia Commons, Openverse
```

### 1.2 主要コンポーネント

#### バックエンド (Workers API)
- **エントリーポイント**: `workers/thumbnail-api/src/index.ts`
- **ルート**: `workers/thumbnail-api/src/routes/image-search.ts`
- **検索ロジック**: `workers/thumbnail-api/src/services/search/index.ts`
- **検索ソース実装**:
  - `workers/thumbnail-api/src/services/search/wikipedia.ts`
  - `workers/thumbnail-api/src/services/search/wikimedia.ts`
  - `workers/thumbnail-api/src/services/search/openverse.ts`

#### フロントエンド
- **UIコンポーネント**: `src/components/editor/TiptapEditor/EditorRecommendationBar.tsx`
- **API呼び出し**: `THUMBNAIL_API_BASE_URL/api/image-search`

---

## 2. 現在の検索ロジック詳細

### 2.1 検索ソース

#### 2.1.1 Wikipedia (`searchWikipedia`)
- **用途**: 1ページ目のみ、検索結果の最初の1件のみ
- **取得方法**:
  1. Wikipedia APIでタイトル検索（`srlimit=1`）
  2. 最初の結果のタイトルを取得
  3. Wikipedia REST APIでページサマリーを取得
  4. サマリーからサムネイル画像を抽出
- **制限**: 
  - 1ページ目のみ
  - 1件のみ
  - 検索結果が0件の場合は空配列を返す

#### 2.1.2 Wikimedia Commons (`searchWikimedia`)
- **用途**: メイン検索ソース（残りの半分を担当）
- **取得方法**:
  - Wikimedia Commons APIの`generator=search`を使用
  - 名前空間6（ファイル）を検索
  - `gsroffset`と`gsrlimit`でページング対応
- **制限**: 
  - オフセットベースのページング
  - 検索結果の品質はWikimedia Commonsの内容に依存

#### 2.1.3 Openverse (`searchOpenverse`)
- **用途**: 補助検索ソース（残りの半分を担当）
- **取得方法**:
  - Openverse API (`api.openverse.org/v1/images/`)
  - ページベースのページング
- **制限**: 
  - Openverseの検索アルゴリズムに依存
  - 主にCCライセンスの画像

### 2.2 検索結果の統合ロジック

```typescript
// 1ページ目の場合
- Wikipedia: 1件（固定）
- 残りlimit = limit - wikipediaItems.length
- Wikimedia: Math.ceil(remainingLimit / 2)
- Openverse: remainingLimit - primaryLimit

// 2ページ目以降
- Wikipedia: 0件（取得しない）
- Wikimedia: Math.ceil(limit / 2)
- Openverse: limit - primaryLimit
```

**問題点**:
1. Wikipediaは1ページ目のみで1件のみ → 検索結果の多様性が低い
2. 固定の50:50分割 → ソース間の品質差を考慮していない
3. 重複排除はURLベースのみ → 類似画像の重複は検出できない

### 2.3 ページング実装

- **方式**: ページ番号ベース（`cursor`パラメータ）
- **実装**: `cursor`は文字列型だが、内部的には数値として扱われる
- **制限**: 
  - 各ソースでページング方式が異なる（オフセット vs ページ番号）
  - ソース間でページングが同期していない

---

## 3. API仕様

### 3.1 リクエスト

```
GET /api/image-search?query={query}&cursor={cursor}&limit={limit}
```

**パラメータ**:
- `query`: 検索クエリ（必須、空文字の場合は空配列を返す）
- `cursor`: ページ番号（デフォルト: 1、最小: 1）
- `limit`: 取得件数（デフォルト: 10、最小: 1、最大: 30）

### 3.2 レスポンス

```typescript
{
  items: ImageSearchItem[];
  nextCursor?: string; // 次のページ番号（文字列）
}

interface ImageSearchItem {
  id: string;
  previewUrl: string;      // プレビュー用（小さい画像）
  imageUrl: string;         // 実際の画像URL（高解像度）
  alt: string;              // 代替テキスト
  sourceName: string;       // ソース名（例: "Wikimedia Commons"）
  sourceUrl: string;        // ソースページURL
  authorName?: string;      // 作者名（オプション）
  authorUrl?: string;       // 作者URL（オプション）
}
```

---

## 4. 現在の実装の問題点

### 4.1 検索結果の品質

#### 4.1.1 ソースの限定性
- **現状**: Wikipedia系（Wikipedia + Wikimedia Commons）+ Openverseのみ
- **問題**: 
  - 一般Web画像が含まれない
  - 写真系のソース（Pexels, Pixabay, Unsplash等）がない
  - ニュースサイトやブログの画像が含まれない

#### 4.1.2 検索アルゴリズムの制約
- **現状**: 各ソースのデフォルト検索アルゴリズムに依存
- **問題**:
  - Google画像検索のような関連性スコアリングがない
  - 画像の品質や関連性を考慮した並び替えがない
  - 検索クエリの意図を理解していない

### 4.2 検索結果の多様性

#### 4.2.1 Wikipediaの制限
- **現状**: 1ページ目のみ、1件のみ
- **問題**:
  - 検索結果の多様性が低い
  - 2ページ目以降でWikipediaの結果が消える

#### 4.2.2 固定の分割比率
- **現状**: Wikimedia:Openverse = 50:50（固定）
- **問題**:
  - クエリによって最適なソースが異なる可能性がある
  - ソース間の品質差を考慮していない

### 4.3 ページングの問題

#### 4.3.1 ソース間の非同期
- **現状**: 各ソースでページング方式が異なる
- **問題**:
  - Wikimedia: オフセットベース
  - Openverse: ページ番号ベース
  - 統合時に不整合が発生する可能性

#### 4.3.2 ページング情報の欠如
- **現状**: `nextCursor`は単純なページ番号のインクリメント
- **問題**:
  - 各ソースのページング状態を保持していない
  - ソースごとに「次があるか」を判定していない

### 4.4 重複排除の限界

#### 4.4.1 URLベースのみ
- **現状**: `imageUrl`の重複のみチェック
- **問題**:
  - 同じ画像が異なるURLで配信されている場合、重複として検出できない
  - 類似画像の重複は検出できない

---

## 5. Google画像検索との比較

### 5.1 Google画像検索の特徴

1. **多様なソース**: Web全体から画像を収集
2. **関連性スコアリング**: クエリとの関連性で並び替え
3. **画像品質の考慮**: 解像度、アスペクト比、ファイルサイズ等
4. **コンテキスト理解**: ページタイトル、周辺テキスト、alt属性等を考慮
5. **多様性の確保**: 同じ画像の重複を避け、多様な結果を提示

### 5.2 現在の実装との差

| 項目 | Google画像検索 | 現在の実装 |
|------|---------------|-----------|
| ソース | Web全体 | Wikipedia系 + Openverse |
| 関連性スコア | 高度なアルゴリズム | ソース依存 |
| 画像品質 | 考慮される | 考慮されない |
| 多様性 | 高い | 低い（特にWikipediaは1件のみ） |
| 重複排除 | 高度（類似画像検出） | 基本的（URLのみ） |

---

## 6. 改善の方向性

### 6.1 検索ソースの拡充

#### 6.1.1 一般Web画像の追加
- **候補**: 
  - Bing Image Search API
  - Google Custom Search API
  - SerpAPI（Google画像検索のスクレイピング）
- **考慮事項**: 
  - APIキーが必要
  - 利用規約の確認
  - コスト（無料枠の確認）

#### 6.1.2 写真系ソースの追加
- **候補**: 
  - Pexels API（無料、APIキー必要）
  - Pixabay API（無料、APIキー必要）
  - Unsplash API（無料、APIキー必要）
- **利点**: 
  - 高品質な写真
  - 明確なライセンス情報

### 6.2 検索アルゴリズムの改善

#### 6.2.1 関連性スコアリング
- **実装方針**: 
  - 各ソースから取得した結果に対して関連性スコアを計算
  - クエリとのマッチ度、画像の品質、ソースの信頼性等を考慮
- **考慮要素**: 
  - タイトル/alt属性とのマッチ度
  - 画像の解像度・アスペクト比
  - ソースの信頼性

#### 6.2.2 結果の並び替え
- **実装方針**: 
  - 関連性スコアで並び替え
  - ソース間で統合してから並び替え
- **利点**: 
  - より関連性の高い結果が上位に
  - ソース間の品質差を考慮

### 6.3 ページングの改善

#### 6.3.1 統一されたページング方式
- **実装方針**: 
  - 各ソースのページング状態を保持
  - カーソルベースのページングに統一
- **利点**: 
  - ソース間の非同期を解消
  - より正確な「次があるか」の判定

### 6.4 重複排除の強化

#### 6.4.1 画像ハッシュベースの重複排除
- **実装方針**: 
  - 画像のハッシュ（perceptual hash等）を計算
  - ハッシュベースで重複を検出
- **考慮事項**: 
  - 計算コスト
  - ストレージ（ハッシュの保存）

---

## 7. 技術的な制約

### 7.1 Cloudflare Workersの制限

- **実行時間**: 最大30秒（無料プラン）または50秒（有料プラン）
- **メモリ**: 128MB
- **リクエストサイズ**: 100MB
- **考慮事項**: 
  - 複数ソースからの並列取得は可能
  - 画像のダウンロードは避ける（URLのみ返す）

### 7.2 API利用規約

- **Wikimedia Commons**: 
  - 利用規約: オープン（CCライセンス）
  - レート制限: User-Agent必須
- **Openverse**: 
  - 利用規約: オープン（CCライセンス）
  - レート制限: あり（要確認）
- **Wikipedia**: 
  - 利用規約: オープン
  - レート制限: User-Agent必須

### 7.3 コスト

- **現状**: すべて無料API
- **改善後**: 
  - Bing Image Search: 無料枠あり（要確認）
  - Google Custom Search: 無料枠あり（1日100リクエスト）
  - SerpAPI: 有料（無料枠あり）

---

## 8. 新しい実装方針（2026-01-18更新）

### 8.1 方針変更

**現在のアルゴリズムを廃止し、一般Web画像検索に切り替える**

- ❌ Wikipedia + Wikimedia Commons + Openverseの組み合わせを廃止
- ✅ 一般Web画像検索APIに切り替え
- ✅ 画像生成AIによるサムネイル作成機能を追加

### 8.2 推奨実装

#### 8.2.1 Web画像検索
- **推奨**: Google Custom Search API
  - 無料枠: 1日100リクエスト（月約3,000リクエスト）
  - 有料料金: $5/1,000リクエスト
  - 理由: 無料枠が大きく、公式APIで安定している

#### 8.2.2 画像生成AI
- **推奨**: Stability AI (SDXL 1.0) または Google Imagen 4 Fast
  - コスト: $0.009〜$0.02/画像
  - 理由: 低コストで高品質

### 8.3 実装優先順位

1. **Web画像検索の実装**
   - Google Custom Search APIの統合
   - カスタム検索エンジン（CSE）の作成
   - 画像結果のフィルタリング
   - 優先度: 高

2. **画像生成AIの実装**
   - Stability AIまたはGoogle Imagenの統合
   - プロンプト生成ロジックの実装
   - 生成画像の保存処理
   - 優先度: 高

### 8.4 詳細なコスト比較

詳細なコスト比較と選択肢の解説は、別ドキュメントを参照:
- **`docs/specs/image-search-and-generation-options.md`**

---

## 9. 参考資料

- **要件定義**: `docs/specs/thumbnail-search-requirements.md`
- **実装ログ**: `docs/work-logs/20260118/thumbnail-commit-fallback-implementation.md`
- **コスト比較**: `docs/specs/image-search-and-generation-options.md`
- **API型定義**: `workers/thumbnail-api/src/types/api.ts`
- **環境変数**: `workers/thumbnail-api/src/types/env.ts`
