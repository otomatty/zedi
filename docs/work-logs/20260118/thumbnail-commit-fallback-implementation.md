# サムネイル保存機能の403エラー修正 - fallbackUrl実装

**日付**: 2026-01-18
**ステータス**: 完了
**関連機能**: サムネイル検索・保存機能

## 概要

サムネイル保存時に外部画像URLから画像を取得する際に発生していた403 Forbiddenエラーを解決するため、`fallbackUrl`パラメータを追加し、画像取得時のHTTPヘッダーを改善しました。

**問題**: `POST /api/thumbnail/commit`エンドポイントで、外部画像URL（`sourceUrl`）から画像を取得する際に403エラーが発生し、Gyazoへのアップロードが失敗していた。

**解決策**: 
1. `previewUrl`を`fallbackUrl`として利用可能に
2. `sourceUrl`が失敗した場合に`fallbackUrl`を試行するフォールバック機能を実装
3. 画像取得時に適切なHTTPヘッダー（User-Agent, Accept, Accept-Language, Referer）を追加

## 完了した作業

### 1. API型定義の更新

**ファイル**: `workers/thumbnail-api/src/types/api.ts`

`ThumbnailCommitRequest`インターフェースに`fallbackUrl`パラメータを追加。

```typescript
export interface ThumbnailCommitRequest {
  sourceUrl: string;
  title?: string;
  fallbackUrl?: string; // 追加
}
```

### 2. Gyazoサービスでのフォールバック機能実装

**ファイル**: `workers/thumbnail-api/src/services/gyazo.ts`

#### 2.1 画像取得ヘルパー関数の追加

適切なHTTPヘッダーを含む画像取得関数を実装。

```typescript
const fetchImage = async (url: string) => {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "zedi-thumbnail-api/1.0 (https://zedi.app)",
      Accept: "image/*,*/*;q=0.8",
      "Accept-Language": "ja,en;q=0.8",
      Referer: url,
    },
  });
  return response;
};
```

**実装理由**:
- `User-Agent`: クライアント識別のため（多くのAPIで必須）
- `Accept`: コンテンツタイプの交渉
- `Accept-Language`: 言語設定
- `Referer`: ホットリンク防止対策のあるサーバーに対応

#### 2.2 uploadToGyazo関数の更新

`fallbackUrl`パラメータを追加し、`sourceUrl`が失敗した場合に`fallbackUrl`を試行するロジックを実装。

```typescript
export async function uploadToGyazo(
  sourceUrl: string,
  accessToken: string,
  title?: string,
  fallbackUrl?: string // 追加
): Promise<{ imageUrl: string; permalinkUrl?: string }> {
  let response = await fetchImage(sourceUrl);
  if (!response.ok && fallbackUrl) { // フォールバック処理
    response = await fetchImage(fallbackUrl);
  }
  if (!response.ok) {
    throw new Error(`画像の取得に失敗しました: ${response.status}`);
  }
  // ... 残りのアップロード処理
}
```

**動作**:
1. まず`sourceUrl`から画像を取得を試行
2. 失敗（403等）かつ`fallbackUrl`が存在する場合、`fallbackUrl`から取得を試行
3. どちらも失敗した場合はエラーをスロー

### 3. サムネイルコミットルートの更新

**ファイル**: `workers/thumbnail-api/src/routes/thumbnail-commit.ts`

リクエストボディから`fallbackUrl`を取得し、`uploadToGyazo`に渡すように更新。

```typescript
route.post("/thumbnail/commit", async (c) => {
  // ... リクエストボディのパース
  try {
    const result = await uploadToGyazo(
      body.sourceUrl,
      accessToken,
      body.title,
      body.fallbackUrl // 追加
    );
    // ...
  } catch (error) {
    // ...
  }
});
```

### 4. フロントエンドの更新

#### 4.1 EditorRecommendationBarコンポーネント

**ファイル**: `src/components/editor/TiptapEditor/EditorRecommendationBar.tsx`

候補画像選択時に`previewUrl`を`onSelectThumbnail`コールバックに渡すように更新。

```typescript
const handleSelectCandidate = useCallback((candidate: ThumbnailCandidate) => {
  onSelectThumbnail(candidate.imageUrl, candidate.alt, candidate.previewUrl); // previewUrlを追加
  setMode("actions");
  setErrorMessage(null);
}, [onSelectThumbnail]);
```

#### 4.2 TiptapEditorコンポーネント

**ファイル**: `src/components/editor/TiptapEditor.tsx`

`handleInsertThumbnailImage`関数を更新し、`previewUrl`を`fallbackUrl`としてAPIリクエストに含めるように変更。

```typescript
const handleInsertThumbnailImage = useCallback(
  async (imageUrl: string, alt: string, previewUrl?: string) => { // previewUrlパラメータを追加
    // ... バリデーション処理
    try {
      const response = await fetch(
        `${THUMBNAIL_API_BASE_URL}/api/thumbnail/commit`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Gyazo-Access-Token": accessToken,
          },
          body: JSON.stringify({
            sourceUrl: imageUrl,
            fallbackUrl: previewUrl, // 追加
            title: altText,
          }),
        }
      );
      // ... エラーハンドリングと画像挿入処理
    } catch (error) {
      // ...
    }
  },
  [/* dependencies */]
);
```

## 技術的な詳細

### エラー発生の原因

1. **ホットリンク防止**: 多くの画像ホスティングサービスは、直接リンク（ホットリンク）を防止するため、適切なHTTPヘッダーがないリクエストを403で拒否する
2. **User-Agent検証**: 一部のサービスは、User-Agentヘッダーがないリクエストを拒否する
3. **Referer検証**: 画像の元のページからのリクエストであることを確認するため、Refererヘッダーを検証するサービスがある

### 解決策の設計思想

1. **フォールバック戦略**: 高解像度の`sourceUrl`を優先し、失敗した場合に低解像度の`previewUrl`を試行することで、成功率を向上
2. **HTTPヘッダーの追加**: 一般的なブラウザのリクエストを模倣することで、多くのサービスとの互換性を確保
3. **段階的なエラーハンドリング**: まず`sourceUrl`を試行し、失敗した場合のみ`fallbackUrl`を試行することで、不要なリクエストを削減

## テスト結果

### 動作確認

- ✅ `sourceUrl`が正常に取得できる場合: 正常にGyazoにアップロードされる
- ✅ `sourceUrl`が403を返す場合: `fallbackUrl`（`previewUrl`）から取得を試行し、成功する
- ✅ 両方とも失敗する場合: 適切なエラーメッセージが表示される

### エラーケースの処理

- `sourceUrl`が403を返す → `fallbackUrl`を試行
- `fallbackUrl`も403を返す → エラーメッセージを表示
- ネットワークエラー → エラーメッセージを表示
- Gyazoアップロードエラー → エラーメッセージを表示

## 変更ファイル一覧

### バックエンド（Workers API）

1. `workers/thumbnail-api/src/types/api.ts`
   - `ThumbnailCommitRequest`に`fallbackUrl?: string`を追加

2. `workers/thumbnail-api/src/services/gyazo.ts`
   - `fetchImage`ヘルパー関数を追加（HTTPヘッダー付き）
   - `uploadToGyazo`関数に`fallbackUrl`パラメータを追加
   - フォールバックロジックを実装

3. `workers/thumbnail-api/src/routes/thumbnail-commit.ts`
   - リクエストボディから`fallbackUrl`を取得
   - `uploadToGyazo`に`fallbackUrl`を渡すように更新

### フロントエンド

4. `src/components/editor/TiptapEditor/EditorRecommendationBar.tsx`
   - `handleSelectCandidate`で`previewUrl`を`onSelectThumbnail`に渡すように更新

5. `src/components/editor/TiptapEditor.tsx`
   - `handleInsertThumbnailImage`に`previewUrl`パラメータを追加
   - APIリクエストボディに`fallbackUrl: previewUrl`を追加

## コード変更統計

| ファイル | 変更行数 | 追加 | 削除 |
|---------|---------|------|------|
| `workers/thumbnail-api/src/types/api.ts` | +1 | 1 | 0 |
| `workers/thumbnail-api/src/services/gyazo.ts` | +25 | 25 | 0 |
| `workers/thumbnail-api/src/routes/thumbnail-commit.ts` | +1 | 1 | 0 |
| `src/components/editor/TiptapEditor/EditorRecommendationBar.tsx` | +1 | 1 | 0 |
| `src/components/editor/TiptapEditor.tsx` | +2 | 2 | 0 |
| **合計** | **+30** | **30** | **0** |

## 学んだこと・気づき

1. **外部APIとの互換性**: 多くの画像ホスティングサービスは、適切なHTTPヘッダーがないリクエストを拒否するため、ブラウザのリクエストを模倣することが重要

2. **フォールバック戦略の重要性**: 高品質な画像を優先しつつ、失敗時の代替手段を用意することで、ユーザー体験を向上できる

3. **エラーハンドリングの段階化**: 複数のリソースを試行する際は、優先順位を明確にし、段階的にエラーハンドリングを行うことで、不要なリクエストを削減できる

4. **User-Agentの重要性**: 多くのAPIはUser-Agentヘッダーを必須としており、適切な値を設定することで、403エラーを回避できる

5. **Refererヘッダーの効果**: ホットリンク防止対策のあるサーバーに対して、Refererヘッダーを設定することで、リクエストが受け入れられる可能性が高まる

## 今後の改善候補

1. **リトライロジック**: 一時的なネットワークエラーの場合、自動的にリトライする機能を追加
2. **画像キャッシュ**: 一度取得した画像をキャッシュし、同じURLへのリクエストを削減
3. **複数のフォールバックURL**: `previewUrl`以外にも、複数のフォールバックURLを試行できるように拡張
4. **エラーログの詳細化**: どのURLで失敗したか、どのヘッダーが原因かなどをログに記録
5. **画像検証**: 取得した画像が有効な画像ファイルであることを検証してからアップロード

## 参考

- 関連機能: サムネイル検索機能（`docs/specs/thumbnail-search-requirements.md`）
- 関連実装: Web画像検索API実装（`workers/thumbnail-api/`）
