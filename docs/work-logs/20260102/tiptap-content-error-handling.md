# Tiptapコンテンツのエラーハンドリング強化

**日付**: 2026-01-02

## 概要

for-all-learnersから移行したコンテンツに未対応のノード/マークタイプが含まれていた場合、エディターが空白になる問題を解決。エラーハンドリングを強化し、ユーザーに何が問題なのかを明確に表示するようにした。

## 問題の詳細

### 症状
- 移行データを含むページを開くとエディターが完全に空白になる
- テキストのみのコンテンツは正常に表示される
- 画像やカスタムマークを含むコンテンツで問題が発生

### コンソールエラー
```
[tiptap warn]: Duplicate extension names found: ['link']

[tiptap warn]: Invalid content. Passed value: {type: 'doc', content: Array(24)}
Error: RangeError: There is no mark type unilink in this schema
```

### 原因
1. 移行データに`unilink`などの未対応マークタイプが含まれていた
2. zediのTiptapスキーマにはこれらのマークが登録されていない
3. Tiptapは未知のノード/マークタイプを処理できずエラーをスロー
4. 既存のエラーハンドリングではエラーを無視し、コンテンツが表示されなかった

## 解決策

### 1. コンテンツサニタイズユーティリティの作成

**ファイル**: `src/lib/contentUtils.ts`

未対応のノード/マークタイプを自動的に検出・削除する機能を追加。

```typescript
// サポートされているノードタイプ
const SUPPORTED_NODE_TYPES = new Set([
  'doc', 'paragraph', 'text', 'heading', 'blockquote',
  'bulletList', 'orderedList', 'listItem', 'codeBlock',
  'horizontalRule', 'hardBreak', 'mermaid',
]);

// サポートされているマークタイプ
const SUPPORTED_MARK_TYPES = new Set([
  'bold', 'italic', 'strike', 'code', 'link', 'wikiLink',
]);

// サニタイズ結果の型
interface SanitizeResult {
  content: string;
  hadErrors: boolean;
  removedNodeTypes: string[];
  removedMarkTypes: string[];
}

// メイン関数
function sanitizeTiptapContent(content: string): SanitizeResult
```

**機能**:
- 未対応ノードタイプを検出し、テキスト内容を保持しながら削除
- 未対応マークタイプを検出し削除（テキストはそのまま維持）
- 削除されたタイプのリストを返却

### 2. TiptapEditorへのエラーハンドリング追加

**ファイル**: `src/components/editor/TiptapEditor.tsx`

```typescript
// エラー型をエクスポート
export interface ContentError {
  message: string;
  removedNodeTypes: string[];
  removedMarkTypes: string[];
  wasSanitized: boolean;
}

// プロップに追加
interface TiptapEditorProps {
  // ... 既存のプロップ
  onContentError?: (error: ContentError | null) => void;
}
```

**変更点**:
- コンテンツ読み込み時に`sanitizeTiptapContent()`を実行
- エラー発生時に`onContentError`コールバックで親コンポーネントに通知
- サニタイズ後のコンテンツを表示

### 3. PageEditorViewへのエラー表示UI追加

**ファイル**: `src/components/editor/PageEditorView.tsx`

```tsx
{/* コンテンツエラー警告 */}
{contentError && (
  <div className="border-b border-border bg-amber-500/10">
    <Container>
      <Alert className="border-0 bg-transparent py-3">
        <AlertCircle className="h-4 w-4 text-amber-600" />
        <AlertDescription className="text-sm">
          <div className="flex flex-col gap-1">
            <span className="font-medium text-amber-800">
              {contentError.message}
            </span>
            {contentError.removedNodeTypes.length > 0 && (
              <span className="text-xs text-amber-700">
                削除されたノード: {contentError.removedNodeTypes.join(", ")}
              </span>
            )}
            {contentError.removedMarkTypes.length > 0 && (
              <span className="text-xs text-amber-700">
                削除されたマーク: {contentError.removedMarkTypes.join(", ")}
              </span>
            )}
            {contentError.wasSanitized && (
              <span className="text-xs text-amber-600 mt-1">
                ※ コンテンツは自動的に修正されました。保存すると修正後のデータが保存されます。
              </span>
            )}
          </div>
        </AlertDescription>
      </Alert>
    </Container>
  </div>
)}
```

## 変更ファイル一覧

| ファイル | 変更内容 |
|---------|---------|
| `src/lib/contentUtils.ts` | サニタイズユーティリティ追加（+218行） |
| `src/components/editor/TiptapEditor.tsx` | エラーハンドリングロジック追加 |
| `src/components/editor/PageEditorView.tsx` | エラー表示UI追加 |

## 動作フロー

```
1. ページを開く
   ↓
2. コンテンツを取得
   ↓
3. sanitizeTiptapContent() でサニタイズ
   ↓
4. 未対応タイプがあった場合
   ├─ 削除してコンテンツを修正
   ├─ SanitizeResult を返却
   └─ onContentError で親に通知
   ↓
5. エディターに修正済みコンテンツを表示
   ↓
6. 警告バナーを表示（削除されたタイプを明示）
   ↓
7. ユーザーが保存すると修正後のデータが保存される
```

## 今後の改善案

1. **未対応ノードの復元オプション**: 削除されたノードを別途保存し、必要に応じて復元できるようにする

2. **Image拡張の追加**: `@tiptap/extension-image`を追加し、画像ノードをネイティブにサポート

3. **移行スクリプトの改善**: 移行時にすべてのカスタムタイプを適切に変換するよう改善

4. **警告の永続化**: 警告を閉じる機能と、再表示しないオプションの追加

## 結果

- 移行データに問題があっても、エディターが空白にならずコンテンツが表示される
- 何が問題だったかをユーザーに明確に通知
- 自動修正により、ユーザーは保存操作だけで問題を解決できる
