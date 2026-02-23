# ページ詳細（PageEditor）関連のテスト実装提案

ストレージ表示コンポーネント削除に伴い、関連するテストの有無を確認し、未実装だった **PageEditorHeader** のユニットテストを追加した。あわせて **PageEditorView** のテスト方針を提案する。

---

## 1. 実装済み: PageEditorHeader のユニットテスト

**ファイル:** `src/components/editor/PageEditor/PageEditorHeader.test.tsx`

### 方針

- 子コンポーネント（WikiGeneratorButton, ConnectionIndicator, UserAvatars）をモックし、ヘッダー単体の表示・コールバックに集中する。
- `formatTimeAgo` をモックして lastSaved 表示を安定してアサートする。

### カバーしている内容

| カテゴリ             | 内容                                                                                                                                                                                                   |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **表示**             | タイトル入力・プレースホルダー、lastSaved の有無、errorMessage 時の `text-destructive`、collaboration 時の ConnectionIndicator / UserAvatars、**ストレージ表示がヘッダーにないこと**                   |
| **インタラクション** | 戻る → onBack、タイトル変更 → onTitleChange、Wiki Generator → onGenerateWiki、ドロップダウンから「Markdownでエクスポート」「Markdownをコピー」「削除」→ 各コールバック、collaboration 時の onReconnect |

### 実行方法

```bash
npx vitest run src/components/editor/PageEditor/PageEditorHeader.test.tsx
```

※ 全体テストは `bun test` だと Vitest 設定が効かず jsdom 未設定になるため、`npx vitest run` を推奨。

### 共通 setup の修正

`src/test/setup.ts` で `ResizeObserver` / `IntersectionObserver` を **class ベースのモック** に変更済み。Radix の DropdownMenu（floating-ui）が `new ResizeObserver()` するため、従来の `vi.fn().mockImplementation(() => ({...}))` だとコンストラクタとして扱えずエラーになっていた。

---

## 2. 未実装: PageEditorView のテスト方針

PageEditorView は次のような依存が多く、**ユニットテストでフルレンダーするより、軽い統合 or E2E でカバーする**のが現実的。

### 主な依存

- `useParams` / `useNavigate` / `useLocation`
- `usePage`, `useUpdatePage`, `useSyncWikiLinks` (React Query)
- `usePageEditorState`, `useEditorAutoSave`, `usePageDeletion`, `useMarkdownExport`, `usePageEditorKeyboard`
- `useTitleValidation`, `useWikiGenerator`, `useCollaboration`, `useAuth`
- `useToast`

### 推奨するテストの入れ方

1. **最小限のユニット（オプション）**
   - `/page/new` のとき `navigate("/", { replace: true })` が呼ばれることだけを、`useNavigate` と `useParams` をモックして検証する。
   - それ以外のロジックはフックや子コンポーネントのテストに任せる。

2. **E2E（推奨）**
   - 既存の `e2e/page-editor.spec.ts` で、ページ詳細を開く・タイトル編集・保存・戻る・ドロップダウンからエクスポート/削除など、ユーザー操作の流れをカバーする。
   - ストレージ表示がヘッダーに**ない**ことは、E2E で「ストレージ用のバッジやリンクが表示されない」というアサーションを 1 本追加すれば足りる。

3. **今回の変更の回帰防止**
   - ヘッダーからストレージ表示を削除したことの担保は、**PageEditorHeader のテスト**で「ストレージ表示用の UI は表示しない」ケースを入れているため、ユニットで十分。
   - PageEditorView 側でストレージ用 props を渡さなくなったことは、型（TypeScript）と PageEditorHeader の props 削除で既に担保されている。

### PageEditorView のユニットテストを書く場合の例

```tsx
// PageEditorView.test.tsx（例: リダイレクトのみ）
vi.mock("react-router-dom", () => ({
  useParams: () => ({ id: "new" }),
  useNavigate: () => mockNavigate,
  useLocation: () => ({ pathname: "/page/new", search: "", state: null }),
}));
// usePage, usePageEditorState, useAuth, ... をすべてモック
// レンダー後に expect(mockNavigate).toHaveBeenCalledWith("/", { replace: true })
```

必要なら上記のような「new リダイレクト」に絞った 1 テストを追加し、残りは E2E に任せる形でよい。

---

## 3. まとめ

| 対象                 | 状態                                                         | 備考                                                       |
| -------------------- | ------------------------------------------------------------ | ---------------------------------------------------------- |
| **PageEditorHeader** | ✅ テスト追加済み                                            | 表示・インタラクション・ストレージ非表示をカバー           |
| **PageEditorView**   | 未実装（方針のみ）                                           | 軽いリダイレクトテスト or E2E でカバー推奨                 |
| **共通 setup**       | ✅ ResizeObserver/IntersectionObserver を class モックに変更 | ドロップダウン利用コンポーネントのテストが通るようになった |

テスト実行は `npx vitest run` で行うと、vite.config の jsdom と setup が適用され、PageEditorHeader 含め既存のコンポーネントテストが安定して動作する。
