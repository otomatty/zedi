# セルフレビュー: ローカル変更（develop 作業ツリー）

**日時**: 2025-03-19
**ベース**: develop（未コミットの変更を対象）
**変更ファイル数**: 多数（レイアウト・サイドバー・Note ページ分割・AI チャットドック等）
**関連ファイル数**: 上記に含む

## サマリー

共通レイアウトとして `AppLayout`（ヘッダー + 左サイドバー + 中央コンテンツ + 右 AI チャットドック）を導入し、`NotesLayout` / `Home` / `SearchResults` / `NoteView` / `NoteSettings` / `NoteMembers` / `NotePageView` をすべてこのレイアウトでラップしている。サイドバーは `packages/ui` を `sidebar.tsx` 単体から `sidebar/` ディレクトリ構成（SidebarProvider, SidebarPrimitives, SidebarMenu 等）に分割。AI チャットはレイアウト層の `AIChatDock` に集約し、`ContentWithAIChat` は `useLocalPanel` が true のときのみ自前でパネルを描画（PageEditor 用）。Note 系ページは `NoteView` / `NoteSettings` / `NoteMembers` をフォルダ分割し、各セクションを子コンポーネントに切り出している。`PageGrid` は `useContainerColumns` でコンテナ幅に応じた列数（2〜6）を算出するよう変更。`aiChatStore` の persist に `version: 1` を追加。

## ファイルサイズ

| ファイル                                     | 行数 | 判定                           |
| -------------------------------------------- | ---- | ------------------------------ |
| packages/ui/.../SidebarPrimitives.tsx        | 347  | Warning: 250行超（分割を推奨） |
| packages/ui/.../SidebarMenu.tsx              | 256  | Warning: 250行超（分割を推奨） |
| src/components/ai-chat/ContentWithAIChat.tsx | 168  | OK                             |
| src/pages/NoteView/index.tsx                 | 166  | OK                             |
| src/pages/NoteSettings/index.tsx             | 161  | OK                             |
| src/pages/NoteMembers/index.tsx              | 146  | OK                             |
| src/components/page/PageGrid.tsx             | 124  | OK                             |
| src/components/layout/AppSidebar.tsx         | 98   | OK                             |
| src/App.tsx                                  | 99   | OK                             |
| src/components/layout/AIChatDock.tsx         | 57   | OK                             |
| src/hooks/useContainerColumns.ts             | 59   | OK                             |
| src/components/layout/AppLayout.tsx          | 38   | OK                             |

## 指摘事項

### 🔴 Critical（マージ前に修正必須）

| #        | ファイル | 行  | 観点 | 指摘内容 | 推奨修正 |
| -------- | -------- | --- | ---- | -------- | -------- |
| （なし） | -        | -   | -    | -        | -        |

### 🟡 Warning（修正を推奨）

| #   | ファイル                              | 行  | 観点           | 指摘内容            | 推奨修正                                                                                                                    |
| --- | ------------------------------------- | --- | -------------- | ------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| 1   | packages/ui/.../SidebarPrimitives.tsx | -   | 可読性・保守性 | 347 行で 250 行超。 | 責務ごとに分割（例: SidebarRail / SidebarInset / Sheet 用ラッパーを別ファイルに）。既存の TiptapEditor 分割パターンに準拠。 |
| 2   | packages/ui/.../SidebarMenu.tsx       | -   | 可読性・保守性 | 256 行で 250 行超。 | メニューアイテム・サブメニュー・スケルトン等を _Menu_.tsx 群に分割するか、1 ファイル内でコンポーネント単位に整理。          |

### 🟢 Info（任意の改善提案）

| #   | ファイル                         | 行    | 観点             | 指摘内容                                                                                                         | 推奨修正                                                                                          |
| --- | -------------------------------- | ----- | ---------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| 1   | src/hooks/useContainerColumns.ts | 51-54 | パフォーマンス   | `window` の `resize` を併用している。ResizeObserver でコンテナ幅変化は捕捉されるため、サイドバー開閉時は冗長。   | 列数がビューポートのみに依存しないなら、`resize` リスナーを外し ResizeObserver のみにしてもよい。 |
| 2   | src/pages/NoteSettings/index.tsx | 35-43 | アーキテクチャ   | `useEffect` 内で `queueMicrotask` を使って state を同期している。                                                | 意図（バッチや描画タイミング）がコメントで明示されていると保守しやすい。                          |
| 3   | 新規レイアウト・ページ           | -     | プロジェクト規約 | 新規の AppLayout / AppSidebar / AIChatDock / useContainerColumns / Note\* 分割コンポーネントに単体テストがない。 | TDD 方針に従い、主要パスや権限表示のテスト追加を検討。                                            |

## テストカバレッジ

| 変更ファイル                         | テストファイル | 状態                                            |
| ------------------------------------ | -------------- | ----------------------------------------------- |
| src/App.tsx                          | -              | ⚠️ 変更は import パスのみ                       |
| src/components/layout/AppLayout.tsx  | -              | ⚠️ テスト未作成                                 |
| src/components/layout/AppSidebar.tsx | -              | ⚠️ テスト未作成                                 |
| src/components/layout/AIChatDock.tsx | -              | ⚠️ テスト未作成                                 |
| src/hooks/useContainerColumns.ts     | -              | ⚠️ テスト未作成                                 |
| src/pages/NoteView/\*                | -              | ⚠️ テスト未作成（NotePageView.test.tsx は既存） |
| src/pages/NoteSettings/\*            | -              | ⚠️ テスト未作成                                 |
| src/pages/NoteMembers/\*             | -              | ⚠️ テスト未作成                                 |
| src/components/page/PageGrid.tsx     | -              | ⚠️ テスト未作成                                 |
| packages/ui/.../sidebar/\*           | -              | ⚠️ UI パッケージのテスト要確認                  |

## Lint / Format チェック

- **ESLint**: `bun run lint` は **成功**（exit 0）。
- **Prettier**: `bun run format:check` は **失敗**（exit 1）。対象は `docs/reviews/review-develop-20250319-1.md` のみ。本変更のソースコードには問題なし。必要なら `bun run format` で該当 doc を整形するか、`docs/reviews` を Prettier の対象外に設定。

## 統計

- Critical: 0 件
- Warning: 2 件
- Info: 3 件
