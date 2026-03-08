# セルフレビュー: develop vs main

**日時**: 2026-03-08 22:52
**ベース**: main
**変更ファイル数**: 185 files（`main..develop`）
**関連ファイル数**: 20 files（`admin` / `server/api` / `ai-chat` / `editor` / `packages/ui` を重点確認）

## サマリー

`main` から `develop` への差分は、`@zedi/ui` への共通 UI 抽出、管理画面のユーザー管理追加、AI モデル管理 UI のモバイル対応、editor のコードブロックコピー、AI chat の WikiLink / 編集再送 / 会話履歴強化が中心だった。  
広い差分ではあるものの、機械的な import 置換や UI パッケージ移設が大半で、実質的な挙動変更は `admin/users` と `src/components/ai-chat` 周辺に集中している。レビューではその挙動変更と既存テスト有無を優先して確認した。

## ファイルサイズ

| ファイル                                             | 行数 | 判定                           |
| ---------------------------------------------------- | ---- | ------------------------------ |
| `server/api/src/routes/admin/index.ts`               | 115  | OK                             |
| `admin/src/pages/users/index.tsx`                    | 101  | OK                             |
| `admin/src/pages/users/UsersContent.tsx`             | 128  | OK                             |
| `src/components/ai-chat/AIChatUserMessageBubble.tsx` | 206  | OK                             |
| `packages/ui/src/index.ts`                           | 273  | Warning: 250行超（分割を推奨） |

## 指摘事項

### 🔴 Critical（マージ前に修正必須）

| #   | ファイル                                 | 行      | 観点        | 指摘内容                                                                                                                                                                                                                                                                                                                     | 推奨修正                                                                                                                                                               |
| --- | ---------------------------------------- | ------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `src/components/ai-chat/AIChatPanel.tsx` | 130-150 | 挙動 / 設計 | AI chat は `append-to-page` と `suggest-wiki-links` を新しい必須アクションとしてプロンプトで要求し、`AIChatActionCard` でも実行ボタンを表示しているが、実処理側は `create-page` / `create-multiple-pages` しか扱っていない。結果として新しく表示されるボタンがクリックされても何も起きず、機能追加が見かけ倒しになっている。 | `handleExecuteAction()` に `append-to-page` と `suggest-wiki-links` の処理を追加する。最低限、未対応ならボタンを非表示または disabled にし、到達不能な UI を出さない。 |

### 🟡 Warning（修正を推奨）

| #   | ファイル                          | 行    | 観点                | 指摘内容                                                                                                                                                                                                                                             | 推奨修正                                                                                                                                                        |
| --- | --------------------------------- | ----- | ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `src/hooks/useAIChat.ts`          | 83-90 | 挙動 / データ整合性 | 編集再送 (`editAndResend`) が元メッセージの `referencedPages` をそのまま再利用しており、編集後の本文と参照ページが乖離する。`@Page` を削除しても古い参照が AI に渡り続け、逆に新しく書いた参照は反映されないため、誤ったコンテキストで再生成される。 | 編集内容から参照ページを再解決するか、編集再送時は参照ページを明示的に再選択させる。少なくとも「本文」と「referencedPages」がズレたまま送信されないようにする。 |
| 2   | `admin/src/pages/users/index.tsx` | 26-30 | 機能要件 / UX       | ユーザー一覧は API 側で `limit` / `offset` に対応しているのに、UI 側は常に `limit: 50, offset: 0` で固定されており、`UsersContent` にページ移動 UI もない。51件目以降のユーザーは管理画面から到達不能になる。                                        | ページネーションか無限スクロールを追加し、`total` を実際に使って次ページへ進めるようにする。少なくとも 50 件を超える環境で管理不能にならないことを確認する。    |
| 3   | `packages/ui/src/index.ts`        | 1-273 | 可読性・保守性      | `@zedi/ui` の barrel file が 273 行あり、ガイドライン上は分割推奨ラインを超えている。現時点で即時の不具合はないが、今後 export が増えると衝突や見落としが起きやすい。                                                                                | `components`, `hooks`, `utilities` などのサブ barrel に分割し、ルート `index.ts` は再 export のみを持つ薄い構成にする。                                         |

### 🟢 Info（任意の改善提案）

| #   | ファイル                                                                                            | 行    | 観点          | 指摘内容                                                                                                                                                                                                     | 推奨修正                                                                           |
| --- | --------------------------------------------------------------------------------------------------- | ----- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| 1   | `server/api/src/routes/admin/index.ts`                                                              | 27-74 | テスト / 仕様 | `GET /api/admin/users` には基本の 200/401/403/limit/offset テストはあるが、実運用で重要な検索条件（`search`）の挙動までは検証していない。UI に検索欄が追加されたので、ここが壊れても今のテストでは拾えない。 | `search` あり / なし、部分一致、0件、ワイルドカード文字の扱いを追加でテストする。  |
| 2   | `src/components/editor/CodeBlockWithCopyNodeView.tsx`, `src/components/ai-chat/AIChatCodeBlock.tsx` | —     | テスト        | コードコピー UI は editor と AI chat の両方に追加されたが、クリップボード連携やキーボードフォーカスのテストが見当たらない。見た目変更よりも操作性の差分なので、将来の回帰検知が弱い。                        | 単体テストまたは E2E で copy ボタンの表示・クリック・`aria-label` 変化を確認する。 |

## テストカバレッジ

| 変更ファイル                                                                                                              | テストファイル                                                  | 状態              |
| ------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | ----------------- |
| `server/api/src/routes/admin/index.ts`                                                                                    | `server/api/src/__tests__/routes/admin/index.test.ts`           | ✅ 既存テストあり |
| `admin/src/pages/users/index.tsx`, `UsersContent.tsx`, `UserCard.tsx`                                                     | -                                                               | ⚠️ テスト未作成   |
| `src/components/ai-chat/AIChatPanel.tsx`, `AIChatActionCard.tsx`, `AIChatUserMessageBubble.tsx`, `src/hooks/useAIChat.ts` | -                                                               | ⚠️ テスト未作成   |
| `src/lib/aiChatActions.ts`, `src/lib/aiChatPrompt.ts`                                                                     | `src/lib/aiChatActions.test.ts`, `src/lib/aiChatPrompt.test.ts` | ✅ 既存テストあり |
| `src/components/editor/CodeBlockWithCopyNodeView.tsx`, `src/components/editor/extensions/CodeBlockWithCopyExtension.ts`   | -                                                               | ⚠️ テスト未作成   |
| `admin/src/pages/ai-models/SyncPreviewModal.tsx`                                                                          | `admin/src/pages/ai-models/SyncPreviewModal.test.tsx`           | ✅ 既存テストあり |

## Lint / Format チェック

- `bun run lint`: **実行不可**。`develop` の一時 worktree 上で実行したが `eslint` が見つからず、ローカル依存が未インストールのため確認できなかった。
- `bun run format:check`: **実行不可**。同様に `prettier` が見つからず、フォーマット確認を完了できなかった。

## セキュリティ・設計メモ

- `server/api/src/routes/admin/index.ts` の `PATCH /users/:id` は self-demotion を防いでおり、最低限の管理者保護は入っている。
- `GET /api/admin/users` は `[%_\\]` をエスケープしてから `LIKE` に渡しており、検索文字列のワイルドカード混入には配慮されている。
- `packages/ui` への移設の大半は import 置換と export 集約で、今回確認した範囲では即時の高リスクな build break は見当たらなかった。

## 統計

- Critical: 1 件
- Warning: 3 件
- Info: 2 件
