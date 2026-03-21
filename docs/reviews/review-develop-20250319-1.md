# セルフレビュー: develop（未コミット変更）

**日時**: 2025-03-19
**ベース**: develop（手元の未コミット変更を対象）
**変更ファイル数**: 19 files（修正 15 + 新規 4）
**関連ファイル数**: 約 10 files（呼び出し元・テスト参照）

**対応状況（2025-03-19 実施）**: Prettier 修正、Critical（sidebar / NoteView 分割）、Warning（NoteSettings / NoteMembers 分割）をすべて対応済み。`bun run format:check` および `bun run lint`、`bun run build` は成功。

## サマリー

共通レイアウトとして `AppLayout`（ヘッダー + `AppSidebar` + メイン + `AIChatDock`）を導入し、Home / Notes / NoteView / NotePageView / SearchResults 等のページをこのレイアウトでラップするように変更している。AI チャットはレイアウト層の `AIChatDock` に集約し、`ContentWithAIChat` は `useLocalPanel` 時（PageEditor）のみローカルパネルを描画する構成に整理。また `PageGrid` はコンテナ幅ベースの列数算出のため `useContainerColumns` を導入し、ResizeObserver で列数を 2〜6 に可変している。

## ファイルサイズ

| ファイル                                              | 行数 | 判定                              |
| ----------------------------------------------------- | ---- | --------------------------------- |
| packages/ui/src/components/sidebar.tsx                | 737  | 🔴 Critical: 400行超              |
| src/pages/NoteView.tsx                                | 437  | 🔴 Critical: 400行超              |
| src/pages/NoteSettings.tsx                            | 285  | 🟡 Warning: 250行超（分割を推奨） |
| src/pages/NoteMembers.tsx                             | 260  | 🟡 Warning: 250行超（分割を推奨） |
| src/components/ai-chat/ContentWithAIChat.tsx          | 168  | OK                                |
| src/components/editor/PageEditor/PageEditorLayout.tsx | 163  | OK                                |
| src/pages/NotePageView.tsx                            | 182  | OK                                |
| src/pages/SearchResults.tsx                           | 152  | OK                                |
| src/components/page/PageGrid.tsx                      | 124  | OK                                |
| src/components/layout/AppSidebar.tsx                  | 98   | OK                                |
| src/pages/Home.tsx                                    | 96   | OK                                |
| src/stores/aiChatStore.ts                             | 70   | OK                                |
| src/components/layout/Header/index.tsx                | 61   | OK                                |
| src/components/note/NotesLayout.tsx                   | 63   | OK                                |
| src/hooks/useContainerColumns.ts                      | 59   | OK                                |
| src/components/layout/AIChatDock.tsx                  | 55   | OK                                |
| src/components/layout/AppLayout.tsx                   | 38   | OK                                |
| src/i18n/locales/en/nav.json                          | 10   | OK                                |
| src/i18n/locales/ja/nav.json                          | 10   | OK                                |

※ sidebar.tsx / NoteView.tsx / NoteSettings.tsx / NoteMembers.tsx の行数は今回の変更で増えたものではなく既存の大きさ。今回の変更は主にレイアウト差し替え・props 追加。

## 指摘事項

### 🔴 Critical（マージ前に修正必須）— 対応済み

| #   | ファイル                               | 行  | 観点             | 指摘内容                                    | 対応内容                                                                                                                                                                          |
| --- | -------------------------------------- | --- | ---------------- | ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | 複数                                   | -   | プロジェクト規約 | Prettier の format チェックが失敗している。 | **対応済み**: `bun run format` を実行。`bun run format:check` 通過。                                                                                                              |
| 2   | packages/ui/src/components/sidebar.tsx | -   | 可読性・保守性   | ファイルが 400 行を超えている（737 行）。   | **対応済み**: `sidebar/` に分割（sidebarConstants, sidebarContext, SidebarProvider, SidebarPrimitives, SidebarMenu, index）。                                                     |
| 3   | src/pages/NoteView.tsx                 | -   | 可読性・保守性   | ファイルが 400 行を超えている（437 行）。   | **対応済み**: `NoteView/` に分割（noteViewHelpers, NoteViewLoadingOrDenied, NoteViewAddPageDialogContent, NoteViewPageGrid, NoteViewHeaderActions, NoteViewMainContent, index）。 |

対象の Prettier 警告ファイル（変更セット内）: `packages/ui/src/components/sidebar.tsx`, `src/components/layout/AIChatDock.tsx`, `src/components/page/PageGrid.tsx`。その他 `package.json`, `src/index.css`, `tailwind.config.ts` は変更セット外でも警告あり。

### 🟡 Warning（修正を推奨）— 対応済み

| #   | ファイル                   | 行  | 観点           | 指摘内容             | 対応内容                                                                                                                                                |
| --- | -------------------------- | --- | -------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | src/pages/NoteSettings.tsx | -   | 可読性・保守性 | 250 行超（285 行）。 | **対応済み**: `NoteSettings/` に分割（noteSettingsConfig, NoteSettingsShareSection, NoteSettingsVisibilitySection, NoteSettingsDeleteSection, index）。 |
| 2   | src/pages/NoteMembers.tsx  | -   | 可読性・保守性 | 250 行超（260 行）。 | **対応済み**: `NoteMembers/` に分割（noteMembersConfig, NoteMembersLoadingOrDenied, NoteMembersManageSection, index）。                                 |

### 🟢 Info（任意の改善提案）

| #   | ファイル                                     | 行    | 観点           | 指摘内容                                                                                                                                                                                                               | 推奨修正                                                                                                                                           |
| --- | -------------------------------------------- | ----- | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | src/hooks/useContainerColumns.ts             | 52–55 | パフォーマンス | `window` の `resize` を購読しているが、同じ要素を `ResizeObserver` で既に監視している。多くの場合、ウィンドウリサイズでも要素サイズが変わるため ResizeObserver で捕捉される。                                          | 冗長であれば `resize` リスナーを削除し、ResizeObserver のみに統一することを検討。                                                                  |
| 2   | src/components/ai-chat/ContentWithAIChat.tsx | 39–43 | アーキテクチャ | `setAIChatAvailable(true/false)` をマウント/アンマウントで呼んでいる。`AppLayout` + `AIChatDock` 利用時は `ContentWithAIChat` が複数ページでマウントされるため、どのページでも「利用可能」が伝わる設計で一貫している。 | 特に対応不要。必要に応じてコメントで「レイアウト層の AIChatDock と併用時は、いずれかの ContentWithAIChat がマウントされている間は true」と補足可。 |

## テストカバレッジ

| 変更ファイル                                 | テストファイル                  | 状態                                              |
| -------------------------------------------- | ------------------------------- | ------------------------------------------------- |
| src/components/layout/AppLayout.tsx          | -                               | ⚠️ テスト未作成                                   |
| src/components/layout/AppSidebar.tsx         | -                               | ⚠️ テスト未作成                                   |
| src/components/layout/AIChatDock.tsx         | -                               | ⚠️ テスト未作成                                   |
| src/hooks/useContainerColumns.ts             | -                               | ⚠️ テスト未作成                                   |
| src/components/ai-chat/ContentWithAIChat.tsx | -                               | ⚠️ テスト未作成（NotePageView.test でモック利用） |
| src/components/page/PageGrid.tsx             | -                               | ⚠️ テスト未作成                                   |
| src/pages/Home.tsx                           | -                               | （既存テストの有無は未確認）                      |
| src/pages/NoteView.tsx                       | -                               | （既存テストの有無は未確認）                      |
| src/pages/NotePageView.tsx                   | src/pages/NotePageView.test.tsx | ✅ 既存テストあり（ContentWithAIChat モック）     |

## Lint / Format チェック

- **ESLint**: `bun run lint` は成功（exit code 0）。
- **Prettier**: **対応済み**。`bun run format` 実行後、`bun run format:check` は成功（exit code 0）。

## 統計

- Critical: 3 件 — **すべて対応済み**
- Warning: 2 件 — **すべて対応済み**
- Info: 2 件（任意のため未対応）
