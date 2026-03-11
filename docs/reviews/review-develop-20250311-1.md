# セルフレビュー: develop（未コミット変更）

**日時**: 2025-03-11
**ベース**: develop（手元の未コミット変更）
**変更ファイル数**: 2 files（+ 未追跡 1: 計画ドキュメント）
**関連ファイル数**: 6 files

## サマリー

BubbleMenu から選択テキストを WikiLink（`[[タイトル]]`）に変換する機能を追加した変更。`EditorBubbleMenu` に `pageId` を渡し、`useCheckGhostLinkReferenced` で referenced を取得してから WikiLink を挿入。既に WikiLink 選択時は「WikiLinkを解除」ボタンを表示する分岐を追加している。既存の `useSuggestionEffects` の挿入パターンと整合している。

## ファイルサイズ

| ファイル                                                | 行数 | 判定                           |
| ------------------------------------------------------- | ---- | ------------------------------ |
| src/components/editor/TiptapEditor.tsx                  | 156  | OK                             |
| src/components/editor/TiptapEditor/EditorBubbleMenu.tsx | 321  | Warning: 250行超（分割を推奨） |

## 指摘事項

### 🔴 Critical（マージ前に修正必須）

| #        | ファイル | 行  | 観点 | 指摘内容 | 推奨修正 |
| -------- | -------- | --- | ---- | -------- | -------- |
| （なし） | -        | -   | -    | -        | -        |

### 🟡 Warning（修正を推奨）

| #   | ファイル             | 行  | 観点             | 指摘内容                                                        | 推奨修正                                                                                                                           |
| --- | -------------------- | --- | ---------------- | --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| 1   | EditorBubbleMenu.tsx | 39  | 可読性・保守性   | アロー関数が 224 行で 150 行超（ESLint max-lines-per-function） | ツールバーボタン群を子コンポーネントや `*Items` 配列に切り出す、WikiLink まわりを `useBubbleMenuWikiLink` のような hook に分離する |
| 2   | EditorBubbleMenu.tsx | -   | 可読性・保守性   | ファイル 321 行で 250 行超                                      | 上記に加え、`BubbleButton` を別ファイルへ移動、PRESET_COLORS を `*Config.ts` に分離するなどで行数削減を検討                        |
| 3   | EditorBubbleMenu.tsx | 295 | プロジェクト規約 | 1 ファイルに複数コンポーネント（react/no-multi-comp）           | `BubbleButton` を `BubbleMenuButton.tsx` などに切り出し                                                                            |

### 🟢 Info（任意の改善提案）

| #   | ファイル             | 行    | 観点               | 指摘内容                                                                        | 推奨修正                                                                                       |
| --- | -------------------- | ----- | ------------------ | ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| 1   | EditorBubbleMenu.tsx | 91-98 | パフォーマンス・UX | `convertToWikiLink` が async の間、ボタンが無防備で連打可能                     | クリック時に loading 状態を set してボタンを disabled にするか、一度だけ実行するガードを入れる |
| 2   | EditorBubbleMenu.tsx | 89    | 可読性             | `isWikiLinkSelection` がレンダーごとに `editor.isActive("wikiLink")` を呼ぶだけ | 現状でも軽いが、必要なら useMemo で editor と selection に紐づけてメモ化可能                   |

## テストカバレッジ

| 変更ファイル         | テストファイル | 状態                                                                                                         |
| -------------------- | -------------- | ------------------------------------------------------------------------------------------------------------ |
| TiptapEditor.tsx     | -              | ⚠️ 本体の単体テストはなし（既存どおり）                                                                      |
| EditorBubbleMenu.tsx | -              | ⚠️ EditorBubbleMenu 専用テストなし。useSuggestionEffects.test.ts で checkReferenced 利用パターンはテスト済み |

## Lint / Format チェック

- **lint**: `bun run lint` → 0 errors, 85 warnings（プロジェクト全体）。変更ファイルでは `EditorBubbleMenu.tsx` に `max-lines-per-function`（39 行目・224 行）と `react/no-multi-comp`（295 行目）の warning が該当。
- **format**: `bun run format:check` → 288 ファイルで warn（プロジェクト全体）。変更した 2 ファイルもリストに含まれる。本変更に起因するフォーマット崩れかは未確認のため、必要なら `bun run format` で変更ファイルのみ整形してからコミット推奨。

## 統計

- Critical: 0 件
- Warning: 3 件
- Info: 2 件
