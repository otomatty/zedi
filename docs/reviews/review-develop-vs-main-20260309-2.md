# セルフレビュー: develop vs main

**日時**: 2026-03-09
**ベース**: main
**変更ファイル数**: 203 files（main..develop）
**関連ファイル数**: 20 files（admin / server/api / ai-chat / editor / packages/ui を重点確認）

## サマリー

`main` から `develop` への差分は、`@zedi/ui` への共通 UI 抽出、管理画面のユーザー管理（ページネーション・検索）、AI chat の append-to-page / suggest-wiki-links 実装・編集再送時の referencedPages 再解決、エディタのコードブロックコピー、AI chat の WikiLink 表示・会話履歴などが中心。前回レビュー（review-develop-vs-main-20260308-1）で指摘した Critical および Warning の多くは、fix/review-develop-vs-main-actions-pagination-ui で対応済み。本レビューでは重点 20 ファイルを 5 観点で確認し、残る指摘を記載した。

## 前回指摘の再検証結果

| 指摘                                                 | 状態         | 確認内容                                                                                                                                                      |
| ---------------------------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Critical: append-to-page / suggest-wiki-links 未実装 | **修正済み** | `useAIChatActions.ts` の `handleExecuteAction` で `append-to-page` と `suggest-wiki-links` を実装。`pageContext?.pageId` がない場合は toast で通知。          |
| Warning: 編集再送で referencedPages 乖離             | **修正済み** | `useAIChat.ts` の `editAndResend` で `resolveReferencedPagesFromContent(newContent, availablePages)` を呼び出し、編集後の本文から参照ページを再解決している。 |
| Warning: admin ユーザー一覧ページネーションなし      | **修正済み** | `UsersContent.tsx` に「前へ」「次へ」ボタンと `onPageChange`。`index.tsx` で `page` state と `getUsers({ offset: page * PAGE_SIZE })` を連携。                |
| Warning: packages/ui barrel 273行                    | **修正済み** | `packages/ui/src/index.ts` は 3 行の re-export のみ。`lib` / `hooks` / `components` に分割済み。                                                              |

## ファイルサイズ

| ファイル                                                 | 行数 | 判定                  |
| -------------------------------------------------------- | ---- | --------------------- |
| src/lib/wikiGenerator.ts                                 | 420  | Critical: 400行超     |
| src/lib/markdownToTiptap.ts                              | 248  | OK（250未満）         |
| src/hooks/useAIChatExecute.ts                            | 187  | OK                    |
| src/pages/NotePageView.tsx                               | 185  | OK                    |
| src/components/editor/PageEditor/usePageEditorEffects.ts | 170  | OK                    |
| admin/src/pages/users/UsersContent.tsx                   | 169  | OK                    |
| src/components/ai-chat/AIChatPanel.tsx                   | 158  | OK                    |
| src/hooks/useAIChatActions.ts                            | 150  | OK                    |
| server/api/src/routes/admin/index.ts                     | 115  | OK                    |
| src/hooks/useAIChat.ts                                   | 110  | OK                    |
| admin/src/pages/users/index.tsx                          | 107  | OK                    |
| src/lib/aiChatActionHelpers.ts                           | 141  | OK                    |
| src/types/aiChat.ts                                      | 98   | OK                    |
| src/contexts/AIChatContext.tsx                           | 42   | OK                    |
| packages/ui/src/index.ts                                 | 3    | OK（barrel 分割済み） |

## 指摘事項

### Critical（マージ前に修正必須）

| #   | ファイル                 | 行      | 観点             | 指摘内容                                                                             | 推奨修正                                                                                 |
| --- | ------------------------ | ------- | ---------------- | ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| 1   | src/lib/wikiGenerator.ts | -       | 可読性・保守性   | ファイル 420 行で 400 行超（ガイドライン Critical）                                  | **対応済み**: wikiGeneratorPrompt / wikiGeneratorUtils / wikiGeneratorProviders に分割。 |
| 2   | src/lib/wikiGenerator.ts | 257-258 | プロジェクト規約 | `requestParams: any` を使用（eslint-disable 付き）。TypeScript strict 方針に反する。 | **対応済み**: wikiGeneratorProviders で `AnthropicStreamParams` 型を定義し any を廃止。  |

### Warning（修正を推奨）

| #   | ファイル                    | 行  | 観点           | 指摘内容                | 推奨修正                                                                                      |
| --- | --------------------------- | --- | -------------- | ----------------------- | --------------------------------------------------------------------------------------------- |
| 1   | src/lib/markdownToTiptap.ts | -   | 可読性・保守性 | 248 行で 250 行に近い。 | **対応済み**: parseInlineContent / sanitizeLinkUrl を markdownToTiptapHelpers.ts に切り出し。 |

### Info（任意の改善提案）

| #   | ファイル                                       | 観点             | 指摘内容                                                                        | 推奨修正                                                                                            |
| --- | ---------------------------------------------- | ---------------- | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| 1   | admin/src/pages/users/_.tsx, docs/reviews/_.md | プロジェクト規約 | `bun run format:check` が admin の users 関連と docs/reviews の一部で失敗       | 該当ファイルで `prettier --write` を実行し、フォーマットを揃える。                                  |
| 2   | src/contexts/AIChatContext.tsx                 | Lint             | `react-refresh/only-export-components` の警告（Provider と hook の両方 export） | 既存パターンのため許容。必要に応じて constants を別ファイルに分離。                                 |
| 3   | server/api GET /api/admin/users                | テスト           | 検索パラメータ `search` の挙動（部分一致・0件・エスケープ）のテストが不足       | 前回 Info と同様。search あり/なし・0件・ワイルドカード文字のテストを追加すると回帰検知が強くなる。 |

## テストカバレッジ

| 変更ファイル                                             | テストファイル                                      | 状態           |
| -------------------------------------------------------- | --------------------------------------------------- | -------------- |
| src/lib/aiChatActionHelpers.ts                           | src/lib/aiChatActionHelpers.test.ts                 | 既存テストあり |
| src/hooks/useAIChat.ts                                   | src/hooks/useAIChat.test.ts                         | 既存テストあり |
| src/hooks/useAIChatActions.ts                            | src/hooks/useAIChatActions.test.ts                  | 既存テストあり |
| src/components/ai-chat/AIChatPanel.tsx                   | src/components/ai-chat/AIChatPanel.test.tsx         | 既存テストあり |
| server/api/src/routes/admin/index.ts                     | server/api/src/**tests**/routes/admin/index.test.ts | 既存テストあり |
| admin/src/pages/users/UsersContent.tsx                   | admin/src/pages/users/UsersContent.test.tsx         | 既存テストあり |
| admin/src/pages/users/index.tsx                          | -                                                   | テスト未作成   |
| src/components/editor/PageEditor/usePageEditorEffects.ts | -                                                   | テスト未作成   |
| src/pages/NotePageView.tsx                               | -                                                   | テスト未作成   |
| src/lib/wikiGenerator.ts                                 | -                                                   | テスト未作成   |
| src/lib/markdownToTiptap.ts                              | -                                                   | テスト未作成   |

## Lint / Format チェック

- **lint**: `bun run lint` → **0 errors, 58 warnings**。本差分の重点ファイルに起因する新規エラーはなし。AIChatContext.tsx の `react-refresh/only-export-components` は既存パターン。他警告は既存ファイル（packages/ui、editor、settings 等）。
- **format**: `bun run format:check` → 以下で失敗: `admin/src/pages/users/index.tsx`, `admin/src/pages/users/UsersContent.tsx`, `admin/src/pages/users/UsersContent.test.tsx`, `docs/reviews/review-develop-vs-main-20260308-1.md`, `docs/reviews/review-fix-review-develop-vs-main-actions-pagination-ui-20260309-1.md`。修正する場合は当該ファイルで `prettier --write` を実行。

## セキュリティ・設計メモ

- `server/api/src/routes/admin/index.ts`: `GET /users` の検索文字列で `[%_\ ]` をエスケープして LIKE に渡しており、ワイルドカード混入に配慮済み。`PATCH /users/:id` は self-demotion を禁止。
- `src/lib/markdownToTiptap.ts`: リンク URL の `sanitizeLinkUrl` で `javascript:`, `data:` 等を拒否。XSS 対策として妥当。
- AI chat の `append-to-page` / `suggest-wiki-links` は `pageContext?.pageId` が存在する場合のみ実行され、他ページへの書き込みは行わない。

## 統計

- Critical: 2 件（wikiGenerator の 400 行超 + any 型使用）
- Warning: 1 件
- Info: 3 件
