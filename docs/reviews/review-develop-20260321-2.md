# セルフレビュー: develop（作業ツリー）

**日時**: 2026-03-21 16:30  
**ベース**: `develop`（`develop..HEAD` のコミット差分はなし。作業ツリー＋未追跡を対象）  
**変更ファイル数**: 追跡ファイルの変更・削除 20 + 未追跡の新規（レイアウト・ノートページ分割・UI サイドバー等）  
**関連ファイル数**: 20（優先度の高い実装・テスト・設定を精読）

## サマリー

アプリシェルを `AppLayout`（`SidebarProvider` + 全幅 `Header` + `AppSidebar` + `SidebarInset` + `AIChatDock`）に寄せ、CSS 変数 `--app-header-height` / `--ai-chat-width` でヘッダー下の高さと AI チャット幅を統一している。`@zedi/ui` のサイドバーは単一ファイル削除に伴い `sidebar/` 配下へ分割され、ノート周りページはディレクトリ＋サブコンポーネントへ整理されている。ページグリッドは `useContainerColumns` と `ResizeObserver` でコンテナ幅ベースの列数に追従し、Stryker の `mutate` にレイアウト・ノート関連ファイルが追加されている。

## ファイルサイズ

| ファイル                                                   | 行数 | 判定             |
| ---------------------------------------------------------- | ---- | ---------------- |
| `packages/ui/src/components/sidebar/SidebarPrimitives.tsx` | 242  | OK（250 行未満） |
| `packages/ui/src/components/sidebar/SidebarMenu.tsx`       | 177  | OK               |
| `packages/ui/src/components/sidebar/SidebarRoot.tsx`       | 113  | OK               |
| `src/pages/NoteView/index.tsx`                             | 166  | OK               |
| `src/components/ai-chat/ContentWithAIChat.tsx`             | 168  | OK               |
| `src/components/page/PageGrid.tsx`                         | 124  | OK               |
| `src/components/layout/AppSidebar.tsx`                     | 98   | OK               |
| `src/components/layout/AIChatDock.tsx`                     | 57   | OK               |
| `src/components/layout/AppLayout.tsx`                      | 38   | OK               |
| `src/hooks/useContainerColumns.ts`                         | 59   | OK               |

## 指摘事項

### 🔴 Critical（マージ前に修正必須）

| #   | ファイル | 行  | 観点 | 指摘内容 | 推奨修正 |
| --- | -------- | --- | ---- | -------- | -------- |
| —   | —        | —   | —    | なし     | —        |

### 🟡 Warning（修正を推奨）

| #   | ファイル | 行  | 観点 | 指摘内容                                                                                                                                                                                                                                                                                                                                                                                                        | 推奨修正 |
| --- | -------- | --- | ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| —   | —        | —   | —    | **対応済み**（2026-03-21）: `sidebarMenuButtonVariants` を `sidebarMenuButtonVariants.ts` へ分離、`useSidebar` を `useSidebar.ts` へ分離、`SidebarContext` を `sidebarContext.tsx` のみ export、`SidebarContextValue` を `sidebarTypes.ts` へ分離。`sidebarConstants.ts` に export 単位の JSDoc を付与。`SidebarProvider` に TSDoc。`bunx eslint packages/ui/src/components/sidebar/**/*.{ts,tsx}` で警告ゼロ。 | —        |

### 🟢 Info（任意の改善提案）

| #   | ファイル                           | 行    | 観点           | 指摘内容                                                                                                                                | 推奨修正                                 |
| --- | ---------------------------------- | ----- | -------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| 1   | `packages/ui/.../SidebarRoot.tsx`  | 3     | 保守性         | 未使用の `useIsMobile` import（`@typescript-eslint/no-unused-vars`）。**レビュー中に削除済み。**                                        | —                                        |
| 2   | `src/hooks/useContainerColumns.ts` | 44–56 | パフォーマンス | `ResizeObserver` に加え `window` の `resize` も購読。多くのケースでは RO だけで足りるが、保険としての意図ならコメントで明記するとよい。 | 実測で冗長なら `resize` リスナーを外す。 |
| 3   | リポジトリ（Git）                  | —     | 保守性         | `git status` で `docs/...` と `docs\...` のように同一内容が二重表示される場合がある（Windows）。コミット時に重複パスに注意。            | 追加・移動は一方のパス規約に統一。       |

## テストカバレッジ

| 変更ファイル                             | テストファイル                                          | 状態              |
| ---------------------------------------- | ------------------------------------------------------- | ----------------- |
| `src/components/layout/AppLayout.tsx`    | `AppLayout.test.tsx`                                    | ✅ 新規           |
| `src/components/layout/AppSidebar.tsx`   | `AppSidebar.test.tsx`                                   | ✅ 新規           |
| `src/components/layout/AIChatDock.tsx`   | `AIChatDock.test.tsx`                                   | ✅ 新規           |
| `src/components/layout/Header/index.tsx` | `Header/index.test.tsx`                                 | ✅ 新規           |
| `src/hooks/useContainerColumns.ts`       | `useContainerColumns.test.tsx`                          | ✅ 新規           |
| `src/pages/NoteView/index.tsx`           | `NoteView/NoteView.test.tsx`, `noteViewHelpers.test.ts` | ✅ 新規           |
| `src/pages/NoteSettings/index.tsx`       | `NoteSettings/NoteSettings.test.tsx`                    | ✅ 新規           |
| `src/pages/NoteMembers/index.tsx`        | `NoteMembers/NoteMembers.test.tsx`                      | ✅ 新規           |
| `src/pages/NotePageView.tsx`             | `NotePageView.test.tsx`（更新）                         | ✅ あり           |
| `packages/ui/src/components/sidebar/*`   | —                                                       | ⚠️ 専用テストなし |

## Lint / Format チェック

- `bun run format:check`: **成功**（`All matched files use Prettier code style!`）。
- `bun run lint`: **終了コード 0**（**エラー 0**、リポジトリ全体では警告多数のベースライン）。**`packages/ui/src/components/sidebar/**` のみ ESLint 警告ゼロ（上記 Warning 対応後）。
- `packages/ui`: `tsc --noEmit` **成功**。

## 統計

- Critical: 0 件
- Warning: 0 件（サイドバー配下は上記対応で解消）
- Info: 3 件（うち 1 件はレビュー中に対応済み）
