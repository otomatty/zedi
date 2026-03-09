# セルフレビュー: fix/review-develop-vs-main-actions-pagination-ui

**日時**: 2026-03-09
**ベース**: develop
**変更ファイル数**: 17 files
**関連ファイル数**: 10 files（AIChatPanel / useAIChat / aiChatActionHelpers / usePageEditorEffects / admin users / packages/ui を重点確認）

## サマリー

- **AIチャット**: `append-to-page` / `suggest-wiki-links` を「現在開いているページのみ」に制限。`PageContext` に `pageFullContent` を追加し、`AIChatPanel.tsx` で追記・WikiLink 追加を実行。編集して再送時は `useAIChat.ts` で `resolveReferencedPagesFromContent` により参照ページを再解決。
- **管理画面**: `UsersContent.tsx` にページネーション UI（前へ/次へ）、`index.tsx` で `page` state と `getUsers` の `offset` 対応。
- **packages/ui**: `index.ts` を barrel 化（`lib`, `hooks`, `components` の re-export）。`components/index.ts`、`hooks/index.ts`、`lib/index.ts` を新規追加。
- **プロンプト・i18n**: `aiChatPrompt.ts` の説明を「現在開いているページ」に合わせて修正。通知用キーを en/ja aiChat.json に追加。

## ファイルサイズ

| ファイル                                                 | 行数 | 判定                                    |
| -------------------------------------------------------- | ---- | --------------------------------------- |
| src/components/ai-chat/AIChatPanel.tsx                   | 295  | Warning: 250行超（分割を推奨）          |
| src/lib/aiChatActionHelpers.ts                           | 358  | Warning: 250行超（分割を推奨）          |
| packages/ui/src/components/index.ts                      | 257  | Warning: 250行超（barrel のため許容可） |
| admin/src/pages/users/UsersContent.tsx                   | 169  | OK                                      |
| src/components/editor/PageEditor/usePageEditorEffects.ts | 159  | OK                                      |
| src/pages/NotePageView.tsx                               | 154  | OK                                      |
| src/hooks/useAIChat.ts                                   | 110  | OK                                      |
| その他                                                   | -    | OK                                      |

## 指摘事項

### 🔴 Critical（マージ前に修正必須）

- **なし**（`any` の新規使用なし、lint エラー 0、400 行超ファイルなし）

### 🟡 Warning（修正を推奨）

| #   | ファイル                               | 行  | 観点           | 指摘内容                                                                  | 推奨修正                                                                                                                                              |
| --- | -------------------------------------- | --- | -------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | src/components/ai-chat/AIChatPanel.tsx | 36  | 可読性・保守性 | 関数 `AIChatPanel` が 230 行で ESLint `max-lines-per-function`（150）超過 | アクション実行ロジックを `useAIChatActions` や `handleExecuteAction` を別 hook/helper に切り出し                                                      |
| 2   | src/components/ai-chat/AIChatPanel.tsx | -   | 可読性・保守性 | ファイル 295 行で 250 行超                                                | 上記分割と合わせ、コンポーネントとロジックの分離を推奨                                                                                                |
| 3   | src/lib/aiChatActionHelpers.ts         | -   | 可読性・保守性 | ファイル 358 行で 250 行超                                                | `convertMarkdownToTiptapContent` / `parseInlineContent` を別ファイル（例: `tiptapMarkdownConverter.ts`）に切り出し、または types を `types.ts` に分離 |

### 🟢 Info（任意の改善提案）

| #   | ファイル                            | 観点             | 指摘内容                                                                                    | 推奨修正                                                               |
| --- | ----------------------------------- | ---------------- | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| 1   | -                                   | プロジェクト規約 | `bun run format:check` が `.cursor/skills/delete-merged-branches/SKILL.md` で失敗（変更外） | 必要に応じて当該ファイルのみ `prettier --write`                        |
| 2   | packages/ui/src/components/index.ts | 可読性           | barrel で 257 行                                                                            | 既存構成のため許容。将来的にコンポーネント群をサブ barrel に分けても可 |

## テストカバレッジ

| 変更ファイル                                             | テストファイル                      | 状態                                           |
| -------------------------------------------------------- | ----------------------------------- | ---------------------------------------------- |
| src/lib/aiChatActionHelpers.ts                           | src/lib/aiChatActionHelpers.test.ts | ✅ 既存テストあり                              |
| src/components/ai-chat/AIChatPanel.tsx                   | -                                   | ⚠️ 単体テストなし                              |
| src/hooks/useAIChat.ts                                   | -                                   | ⚠️ 単体テストなし                              |
| src/components/editor/PageEditor/usePageEditorEffects.ts | -                                   | ⚠️ 単体テストなし                              |
| admin/src/pages/users/\*                                 | -                                   | ⚠️ 単体テストなし                              |
| packages/ui barrel 変更                                  | -                                   | インポート経路変更のため既存テストでカバー想定 |

## Lint / Format チェック

- **lint**: `bun run lint` → **0 errors, 59 warnings**。本差分に起因する警告は **AIChatPanel.tsx** の `max-lines-per-function`（230 > 150）のみ。他は既存ファイルの警告。
- **format**: `bun run format:check` → 変更ファイルに問題なし。`.cursor/` 配下 1 件 fail（変更外）。

## 統計

- Critical: 0 件
- Warning: 3 件
- Info: 2 件
