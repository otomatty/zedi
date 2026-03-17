# セルフレビュー: develop（作業ツリー未コミット）

**日時**: 2025-03-15
**ベース**: develop（HEAD に対する作業ツリーの変更）
**変更ファイル数**: 10 files
**関連ファイル数**: 参照した関連 約15 files（呼び出し元・テスト・contentUtils 等）

## サマリー

コラボモード（Y.Doc）利用時に、Wiki 生成中のコンテンツをエディタに反映するための専用経路を追加した変更。通常の `content` prop は `useContentSanitizer` によりコラボ時はスキップされるため、`wikiContentForCollab` と `onWikiContentApplied` を新設し、PageEditor → TiptapEditor → useEditorLifecycle でサニタイズ後に `editor.commands.setContent` で反映し、反映後にクリア・flushSave する流れになっている。

## ファイルサイズ

| ファイル                                                        | 行数  | 判定                          |
| --------------------------------------------------------------- | ----- | ----------------------------- |
| src/components/editor/PageEditor/PageEditorContent.tsx          | 177   | OK                            |
| src/components/editor/PageEditor/PageEditorLayout.tsx           | 155   | OK                            |
| src/components/editor/PageEditor/usePageEditor.ts               | 123   | OK                            |
| src/components/editor/PageEditor/usePageEditorEffects.ts        | 183   | OK                            |
| src/components/editor/PageEditor/usePageEditorStateAndSync.ts   | 約200 | OK（関数 150 行以内に修正済） |
| src/components/editor/PageEditor/usePageEditorWikiCollab.ts     | 38    | OK（新規）                    |
| src/components/editor/TiptapEditor.tsx                          | 159   | OK                            |
| src/components/editor/TiptapEditor/types.ts                     | 82    | OK                            |
| src/components/editor/TiptapEditor/useEditorLifecycle.ts        | 119   | OK                            |
| src/components/editor/TiptapEditor/useTiptapEditorController.ts | 236   | OK（分割済）                  |
| src/components/editor/TiptapEditor/useSuggestionControllers.ts  | 42    | OK（新規）                    |
| src/components/editor/TiptapEditor/useImageUploadController.ts  | 42    | OK（新規）                    |

## 指摘事項

### 🔴 Critical（マージ前に修正必須）

なし。

### 🟡 Warning（修正を推奨）

| #   | ファイル                     | 行  | 観点                 | 指摘内容                                                        | 推奨修正                                                              | 対応                                                                                                                                                       |
| --- | ---------------------------- | --- | -------------------- | --------------------------------------------------------------- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | usePageEditorStateAndSync.ts | 15  | プロジェクト規約準拠 | ESLint `max-lines-per-function`: 関数が 153 行で上限 150 を超過 | ロジックの一部を別 hook またはヘルパーに切り出して 150 行以内に収める | ✅ 対応済: `usePageEditorWikiCollab` に分離、同一ファイル内で `useDisplayLastSavedAndPending` と `usePageEditorDeletionAndNav` を追加し関数を 150 行以内に |
| 2   | useTiptapEditorController.ts | -   | 可読性・保守性       | ファイル 283 行で 250 行超（既存）。今回の変更で 8 行追加       | 既存方針に従い、責務ごとに hook 分割を検討                            | ✅ 対応済: `useSuggestionControllers.ts` と `useImageUploadController.ts` に切り出し、本体は 236 行に                                                      |

### 🟢 Info（任意の改善提案）

| #   | ファイル                     | 行      | 観点           | 指摘内容                                                                                                                                                                                               | 推奨修正                                   |
| --- | ---------------------------- | ------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------ |
| 1   | usePageEditorStateAndSync.ts | 173-176 | パフォーマンス | `onWikiContentApplied` が毎レンダーで新しい関数参照になるため、useEditorLifecycle の effect の依存配列で再実行の可能性がある（現状は適用後に `wikiContentForCollab` を null にするため実害はほぼなし） | `useCallback` でラップして依存を安定させる |
| 2   | useEditorLifecycle.ts        | 86-92   | アーキテクチャ | エラー時も `onWikiContentApplied?.()` を呼んでクリアしているのは正しい。ログのみで握りつぶさない点は良い                                                                                               | 特になし（記載のみ）                       |

## テストカバレッジ

| 変更ファイル                                                    | テストファイル                | 状態                                                                               |
| --------------------------------------------------------------- | ----------------------------- | ---------------------------------------------------------------------------------- |
| usePageEditorEffects.ts                                         | usePageEditorEffects.test.tsx | ✅ 既存テストあり。`setWikiContentForCollab` を mock に追加済み                    |
| usePageEditorStateAndSync.ts                                    | -                             | ⚠️ 直接の単体テストなし（PageEditor 系は usePageEditorEffects 等で間接的にカバー） |
| useEditorLifecycle.ts                                           | -                             | ⚠️ 直接の単体テストなし                                                            |
| useTiptapEditorController.ts                                    | -                             | ⚠️ 直接の単体テストなし（既存と同様）                                              |
| PageEditorContent.tsx / PageEditorLayout.tsx / usePageEditor.ts | 各種 PageEditor テスト        | ✅ 既存テストあり。今回の props 追加は既存テストの mock 拡張で対応可能             |
| TiptapEditor.tsx / types.ts                                     | TiptapEditor 配下の各種テスト | ✅ 既存テストあり                                                                  |

## Lint / Format チェック

- **ESLint**: 変更ファイルのうち `usePageEditorStateAndSync.ts` で 1 件の warning（`max-lines-per-function` 153/150）。上記 Warning #1 に対応。
- **Prettier**: 変更した 10 ファイルに format 問題なし。リポジトリ他 31 ファイルに `format:check` の warn あり（本変更の範囲外）。

## セキュリティ・設計メモ

- Wiki 生成コンテンツの反映に `sanitizeTiptapContent`（`@/lib/contentUtils`）を利用しており、スキーマ外のノード・マークを除去している。XSS 対策として妥当。
- コラボ時の専用経路で `setContent(parsed)` のみ行い、反映後に `onWikiContentApplied` でクリア・flushSave する設計で、二重反映や競合のリスクは抑えられている。

## 統計

- Critical: 0 件
- Warning: 2 件（いずれも対応済）
- Info: 2 件
