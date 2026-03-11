# セルフレビュー: PR #308（wiki link bubble menu）

**日時**: 2026-03-11
**ベース**: develop
**対象**: PR #308 feat(editor): wiki link bubble menu for Tiptap editor
**変更ファイル数**: 複数（EditorBubbleMenu リファクタ、useBubbleMenuWikiLink、ツールバー・テスト・ドキュメント含む）
**関連ファイル数**: 6 files

## サマリー

BubbleMenu から選択テキストを WikiLink（`[[タイトル]]`）に変換する機能を追加した変更。`EditorBubbleMenu` に `pageId` を渡し、`useCheckGhostLinkReferenced` で referenced を取得してから WikiLink を挿入。既に WikiLink 選択時は「WikiLinkを解除」ボタンを表示する分岐を追加している。既存の `useSuggestionEffects` の挿入パターンと整合している。

## ファイルサイズ

| ファイル                                                | 行数 | 判定                   |
| ------------------------------------------------------- | ---- | ---------------------- |
| src/components/editor/TiptapEditor.tsx                  | 156  | OK                     |
| src/components/editor/TiptapEditor/EditorBubbleMenu.tsx | 30   | OK（リファクタで短縮） |

## 指摘事項

### 🔴 Critical（マージ前に修正必須）

| #        | ファイル | 行  | 観点 | 指摘内容 | 推奨修正 |
| -------- | -------- | --- | ---- | -------- | -------- |
| （なし） | -        | -   | -    | -        | -        |

### 🟡 Warning（修正を推奨）

| #   | ファイル             | 行  | 観点           | 指摘内容                                                                                         | 推奨修正 |
| --- | -------------------- | --- | -------------- | ------------------------------------------------------------------------------------------------ | -------- |
| 1–3 | （PR #308 で対応済） | -   | 可読性・保守性 | EditorBubbleMenu をリファクタし、ツールバー・hook・BubbleMenuButton・bubbleMenuConfig に分割済み | -        |

### 🟢 Info（任意の改善提案）

| #   | ファイル              | 行  | 観点               | 指摘内容                                                                             | 推奨修正 |
| --- | --------------------- | --- | ------------------ | ------------------------------------------------------------------------------------ | -------- |
| 1   | useBubbleMenuWikiLink | -   | パフォーマンス・UX | `convertToWikiLink` の二重クリック防止 → PR レビュー対応で `isConverting` を追加済み | -        |
| 2   | useEditorBubbleMenu   | -   | 可読性             | hasTable / hasTaskList → PR レビュー対応で useMemo 化済み                            | -        |

## テストカバレッジ

| 変更ファイル                                     | テストファイル            | 状態                                                                               |
| ------------------------------------------------ | ------------------------- | ---------------------------------------------------------------------------------- |
| TiptapEditor.tsx                                 | -                         | ⚠️ 本体の単体テストはなし（既存どおり）                                            |
| EditorBubbleMenu.tsx                             | EditorBubbleMenu.test.tsx | ✅ リファクタ後の BubbleMenu 表示・ツールバー・pageId・shouldShow 分岐をテスト済み |
| useBubbleMenuWikiLink / useEditorBubbleMenu / 他 | 各対応 \*.test.ts(x)      | ✅ 単体テストあり                                                                  |

## Lint / Format チェック

- **lint**: `bun run lint` → 0 errors（変更ファイルで新規エラーなし）。
- **format**: `bun run format:check` で変更ファイルを整形済み。

## 統計

- Critical: 0 件
- Warning: 3 件
- Info: 2 件
