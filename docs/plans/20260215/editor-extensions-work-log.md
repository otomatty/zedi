# Tiptap エディター拡張機能 作業ログ

**作業日:** 2026-02-15  
**参照計画書:** [editor-extensions-implementation-plan.md](./editor-extensions-implementation-plan.md)  
**対象:** Phase 0〜4 および共通作業（サニタイザ・テスト・CSS）

---

## 1. 作業サマリー

| 項目 | 内容 |
|------|------|
| 完了フェーズ | Phase 0（スラッシュコマンド）、Phase 1（タスクリスト・ハイライト・下線・コードブロック）、Phase 2（テーブル）、Phase 3（文字色）、Phase 4（数式）、共通作業 |
| 新規ファイル | 7 件 |
| 変更ファイル | 6 件 |
| 追加 npm パッケージ | 19 パッケージ（依存含む） |
| ビルド | 成功 |
| 関連テスト | contentUtils 31 件すべて通過 |

---

## 2. インストールしたパッケージ

```bash
bun add @tiptap/extension-task-list @tiptap/extension-task-item \
  @tiptap/extension-highlight @tiptap/extension-underline \
  @tiptap/extension-table @tiptap/extension-table-row \
  @tiptap/extension-table-cell @tiptap/extension-table-header \
  @tiptap/extension-text-style @tiptap/extension-color \
  @tiptap/extension-mathematics katex \
  lowlight @tiptap/extension-code-block-lowlight highlight.js
```

- **テーブル:** `@tiptap/extension-table` は `Table`, `TableRow`, `TableCell`, `TableHeader` を名前付きエクスポートで提供。別パッケージ `@tiptap/extension-table-row` 等もインストール済みだが、editorConfig では `@tiptap/extension-table` からの名前付きインポートのみ使用。
- **Tiptap v3:** 各拡張は `default` または名前付きエクスポート。editorConfig では名前付きインポート（`{ TaskList }`, `{ Highlight }`, `{ Table, TableRow, TableCell, TableHeader }` 等）で統一。
- **Bubble Menu:** `@tiptap/react` の `TiptapBubbleMenu` を `BubbleMenu` としてエイリアスして使用。

---

## 3. 新規作成ファイル

| ファイルパス | 説明 |
|--------------|------|
| `src/components/editor/extensions/slashSuggestionPlugin.ts` | スラッシュコマンド用 ProseMirror プラグイン。行頭または「スペース + /」でトリガー。`/` 以降の文字列を query として保持し、`onStateChange` で親に通知。`slashSuggestionPluginKey` で `close` meta を処理。 |
| `src/components/editor/TiptapEditor/slashCommandItems.ts` | スラッシュメニュー項目定義（15 項目）。`id`, `title`, `description`, `aliases`, `icon`, `isAvailable(editor)`, `action(editor, range)`。`filterSlashCommandItems()` で query と拡張の有無でフィルタ。 |
| `src/components/editor/TiptapEditor/SlashSuggestionLayer.tsx` | スラッシュメニュー UI。`SlashSuggestionHandle` ref で ArrowUp/Down・Enter・Escape を処理。Lucide アイコン・説明文表示。`slashCommandItems` と `filterSlashCommandItems` を利用。 |
| `src/components/editor/TiptapEditor/EditorBubbleMenu.tsx` | テキスト選択時の Bubble Menu。太字・イタリック・取り消し線・コード・ハイライト、箇条書き・番号付き・タスクリスト、テーブル挿入、文字色（8 色プリセット + デフォルト）。`TiptapBubbleMenu` を使用。 |
| `src/components/editor/TiptapEditor/TableBubbleMenu.tsx` | テーブル内セル選択時の Bubble Menu。行の追加（前/後）・削除、列の追加（前/後）・削除、ヘッダー行トグル、テーブル削除。 |
| `src/components/editor/TiptapEditor/MathEditDialog.tsx` | 数式（LaTeX）編集用ダイアログ。`initialLatex`, `isBlock`, `onSave(latex)`。Ctrl+Enter で保存。Radix Dialog + Textarea。 |
| `docs/plans/20260215/editor-extensions-work-log.md` | 本作業ログ。 |

---

## 4. 変更ファイル

### 4.1 `src/components/editor/TiptapEditor/editorConfig.ts`

- **インポート:** TaskList, TaskItem, Highlight, Underline, Table/TableRow/TableCell/TableHeader, TextStyle, Color, Mathematics, CodeBlockLowlight を追加。いずれも名前付きインポート。
- **StarterKit:** `codeBlock: false` を指定し、CodeBlockLowlight に差し替え。
- **拡張の追加順:** StarterKit → Typography → Placeholder → Link → TaskList → TaskItem → Highlight → Underline → CodeBlockLowlight → Table 系 → TextStyle → Color → Mathematics → WikiLink → WikiLinkSuggestionPlugin → SlashSuggestionPlugin → Image 系 → Mermaid → Collaboration（オプション）。
- **オプション:** `EditorExtensionsOptions` に `onSlashStateChange: (state: SlashSuggestionState) => void` を追加。
- **lowlight:** `createLowlight(common)` で共通インスタンスを生成・エクスポート。
- **CODE_BLOCK_LANGUAGES:** 34 言語の `{ value, label }` 配列を定義（言語選択 UI 用）。

### 4.2 `src/components/editor/TiptapEditor.tsx`

- **状態:** `slashState`, `slashPos`, `slashRef` を追加。`handleSlashStateChange`, `handleSlashClose` を追加。
- **createEditorExtensions:** `onSlashStateChange: handleSlashStateChange` を渡す。
- **editorProps.handleKeyDown:** スラッシュが有効なときは `slashRef.current.onKeyDown` を優先し、次に WikiLink の `suggestionRef` を実行。
- **useEffect:** スラッシュメニュー位置を `slashState.range` から計算。`slash-command-insert-image` カスタムイベントで画像挿入（`handleInsertImageClick`）を呼ぶ。
- **レンダー:** `EditorBubbleMenu`, `TableBubbleMenu` を `editor && !isReadOnly` で配置。`SlashSuggestionLayer` を `!isReadOnly` で配置。

### 4.3 `src/lib/contentUtils.ts`

- **SUPPORTED_NODE_TYPES に追加:** `taskList`, `taskItem`, `table`, `tableRow`, `tableCell`, `tableHeader`, `math`, `mathBlock`。
- **SUPPORTED_MARK_TYPES に追加:** `highlight`, `underline`, `textStyle`。（`color` は TextStyle の属性として扱い、マーク型は `textStyle` のみ追加。）

### 4.4 `src/lib/contentUtils.test.ts`

- **サニタイザ:** タスクリストノード（taskList/taskItem）、テーブルノード（table/tableRow/tableCell/tableHeader）、数式ノード（math/mathBlock）、ハイライト・下線マーク、textStyle マークを含む JSON が削除されないことを確認するテストを追加。全 31 テスト通過。

### 4.5 `src/index.css`

- **@import:** `katex/dist/katex.min.css`, `highlight.js/styles/github-dark.css` を追加。
- **.tiptap-editor:** タスクリスト（`ul[data-type="taskList"]`, `li[data-type="taskItem"]`, チェックボックス・ネスト）、ハイライト（`mark`）、テーブル（`.tableWrapper`, `table`, `th`, `td`, `.selectedCell`）、コードブロック（`pre code.hljs` の背景透明化）、数式（`.Tiptap-mathematics-*`）、スラッシュ入力時（`.slash-command-typing`）のスタイルを追加。
- **ライトモード:** `.light` 下でハイライト用 `mark` と hljs トークン色のオーバーライドを追加。

---

## 5. スラッシュメニュー項目一覧

| 表示名 | エイリアス（検索用） | 挿入内容 |
|--------|----------------------|----------|
| 段落 | 段落, paragraph, p, text | setParagraph |
| 見出し1 | 見出し1, h1, 大見出し, heading | heading level 1 |
| 見出し2 | 見出し2, h2, 中見出し, heading | heading level 2 |
| 見出し3 | 見出し3, h3, 小見出し, heading | heading level 3 |
| 箇条書き | 箇条書き, ul, リスト, bullet, list | toggleBulletList |
| 番号付きリスト | 番号, ol, 順序付き, ordered, number | toggleOrderedList |
| タスクリスト | タスク, todo, チェック, task, checkbox | toggleTaskList |
| 引用 | 引用, blockquote, quote | setBlockquote |
| コードブロック | コード, code, pre, プログラム | setCodeBlock |
| 水平線 | 区切り線, hr, 水平, divider, separator | setHorizontalRule |
| テーブル | テーブル, 表, table | insertTable(3x3, withHeaderRow) |
| 画像 | 画像, image, img, 写真 | カスタムイベントでファイル選択 |
| ダイアグラム | ダイアグラム, mermaid, 図, diagram, flowchart | insertMermaid(サンプル) |
| 数式（インライン） | 数式, math, インライン, latex | insertContent(math, E=mc^2) |
| 数式（ブロック） | 数式ブロック, block math, ブロック数式, equation | insertContent(mathBlock) |

---

## 6. 技術メモ

- **スラッシュトリガー:** 正規表現 `(^|\s)\/([^\s/]*)$` で「行頭またはスペースの直後の `/`」とその後の query を取得。Escape 時はトリガー範囲は削除せずメニューだけ閉じる。
- **WikiLink との競合:** `handleKeyDown` で `slashState?.active` を先に判定し、スラッシュ用 ref を優先。続けて WikiLink 用 ref を呼ぶ。
- **数式ノード名:** Tiptap Mathematics は `math`（インライン）と `mathBlock`（ブロック）を使用。サニタイザは両方を許可。
- **文字色:** 拡張は `TextStyle` + `Color`。サニタイザではマーク型に `textStyle` のみ追加（`color` は textStyle の属性）。
- **CodeBlockLowlight:** `defaultLanguage: null` で未指定時はプレーンテキスト表示。既存の `codeBlock` ノードはそのまま表示可能。

---

## 7. 未実装・今後の検討項目（計画書より）

- **CodeBlockLanguageSelect:** コードブロック選択時の言語ドロップダウン（計画書では任意）。`CODE_BLOCK_LANGUAGES` は editorConfig に定義済み。
- **数式クリックで編集:** MathEditDialog はコンポーネントのみ作成。Mathematics 拡張の `onClick` でダイアログを開く処理は TiptapEditor 側に未接続。必要に応じて `editorConfig` の Mathematics に `onClick` を渡し、開いたダイアログで `updateAttributes` する形で接続可能。
- **Markdown テーブル入力/ペースト:** 計画書 §7 の「Markdown 形式のテーブルの自動変換」は未実装。入力ルールまたはペーストハンドラで対応可能。
- **既存 `$...$` のマイグレーション:** 計画書 §9.5 の `migrateMathStrings(editor)` は未実装。オプションとして `onCreate` や `provider.on('synced', ...)` で実行可能。
- **読み取り専用時の UI:** 計画書 §14.2 の「スラッシュメニュー・Bubble Menu を非表示」は、現状 `!isReadOnly` で SlashSuggestionLayer と Bubble Menu を出し分け済み。

---

## 8. ビルド・テスト結果

- **ビルド:** `bun run build` 成功（Vite 5.4.19）。Chunk サイズ警告（mermaid.core, index 等）は既存どおり。
- **contentUtils テスト:** `bun run test:run -- src/lib/contentUtils.test.ts` で 31 テストすべて通過。
- **他テスト:** `aiSettings.test.ts` で 3 件失敗あり。エディター拡張作業とは無関係の既存事象。

---

## 9. 変更ファイル一覧（パスのみ）

```
src/components/editor/TiptapEditor/editorConfig.ts
src/components/editor/TiptapEditor.tsx
src/components/editor/TiptapEditor/EditorBubbleMenu.tsx       (新規)
src/components/editor/TiptapEditor/TableBubbleMenu.tsx         (新規)
src/components/editor/TiptapEditor/SlashSuggestionLayer.tsx    (新規)
src/components/editor/TiptapEditor/slashCommandItems.ts        (新規)
src/components/editor/TiptapEditor/MathEditDialog.tsx         (新規)
src/components/editor/extensions/slashSuggestionPlugin.ts     (新規)
src/lib/contentUtils.ts
src/lib/contentUtils.test.ts
src/index.css
docs/plans/20260215/editor-extensions-work-log.md             (本ログ)
```

以上が 2026-02-15 時点の作業ログである。
