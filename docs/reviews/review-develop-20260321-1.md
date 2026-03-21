# セルフレビュー: develop（作業ツリー）

**日時**: 2026-03-21 16:15  
**ベース**: `develop`（`develop..HEAD` のコミット差分はなし）  
**変更ファイル数**: 追跡ファイルの変更・削除 約 23 + 未追跡 約 37（概算）  
**関連ファイル数**: 20（優先度の高い実装・テスト・設定を精読）

## サマリー

アプリ全体のレイアウトを `AppLayout` / `AppSidebar` / `AIChatDock` に再構成し、CSS 変数でヘッダー高さと AI チャット幅を統一している。`@zedi/ui` のサイドバーは単一ファイルから複数モジュールへ分割され、ノート関連ページ（`NoteView` / `NoteSettings` / `NoteMembers`）はディレクトリ＋サブコンポーネントへ整理されている。コンテナ幅に応じたグリッド列数は `useContainerColumns` と `ResizeObserver` で扱い、Stryker の mutation 対象にも新ファイルが追加されている。

## ファイルサイズ

| ファイル                                                   | 行数 | 判定                            |
| ---------------------------------------------------------- | ---- | ------------------------------- |
| `packages/ui/src/components/sidebar/SidebarPrimitives.tsx` | 347  | Warning: 250 行超（分割を推奨） |
| `packages/ui/src/components/sidebar/SidebarMenu.tsx`       | 256  | Warning: 250 行超（分割を推奨） |
| `src/pages/NoteView/index.tsx`                             | 166  | OK                              |
| `src/components/layout/AppSidebar.tsx`                     | 98   | OK                              |
| `src/components/layout/AIChatDock.tsx`                     | 57   | OK                              |
| `src/components/layout/AppLayout.tsx`                      | 38   | OK                              |
| `src/hooks/useContainerColumns.ts`                         | 59   | OK                              |

## 指摘事項

### 🔴 Critical（マージ前に修正必須）

| #   | ファイル | 行  | 観点             | 指摘内容                                                                                                                                  | 推奨修正                                                    |
| --- | -------- | --- | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| 1   | （複数） | -   | プロジェクト規約 | `bun run format:check` が失敗。Prettier 未適用のファイルが 14 件（テスト・ドキュメント含む）。CI の「Check formatting」でブロックされる。 | `bun run format` を実行し、該当ファイルをコミットに含める。 |

### 🟡 Warning（修正を推奨）

| #   | ファイル                                | 行  | 観点             | 指摘内容                                                                                                                                                                                                                     | 推奨修正                                                                                              |
| --- | --------------------------------------- | --- | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| 1   | `packages/ui/.../SidebarPrimitives.tsx` | -   | 可読性・保守性   | 347 行で 250 行超。責務ごとにサブコンポーネントまたはファイル分割を検討。                                                                                                                                                    | プロジェクト推奨パターン（Primitives / Menu / Provider 等の粒度）に合わせて分割。                     |
| 2   | `packages/ui/.../SidebarMenu.tsx`       | -   | 可読性・保守性   | 256 行で 250 行超。                                                                                                                                                                                                          | 同上。                                                                                                |
| 3   | `eslint.config.js`（ignores）           | -   | プロジェクト規約 | 作業ツリーに `.stryker-tmp` がある状態で `bun run lint` を実行すると、Stryker サンドボックス内のファイルが対象となり大量の `error` が出る（`@ts-nocheck` 等）。CI のクリーン環境では再現しないが、ローカル検証が阻害される。 | `ignores` に `.stryker-tmp` を追加するか、mutation 実行後に一時ディレクトリを削除する運用を明記する。 |

### 🟢 Info（任意の改善提案）

| #   | ファイル                               | 行    | 観点             | 指摘内容                                                                                                                           | 推奨修正                                                                     |
| --- | -------------------------------------- | ----- | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| 1   | `src/hooks/useContainerColumns.ts`     | 44–56 | パフォーマンス   | `ResizeObserver` に加え `window` の `resize` も購読している。多くのレイアウトでは `ResizeObserver` だけでコンテナ幅変化を拾える。  | 不要なら `resize` リスナーを削除してイベント数を減らす（挙動確認のうえで）。 |
| 2   | `src/components/layout/AIChatDock.tsx` | 19–31 | アクセシビリティ | モバイルの `Drawer` はフォーカストラップ等は UI ライブラリ任せだが、閉じたときのフォーカス戻しは利用シーンに応じて確認の余地あり。 | 必要なら Drawer の `onOpenChange` とフォーカス管理を E2E で確認。            |

## テストカバレッジ

| 変更の主な対象                          | テストファイル                                                     | 状態                                         |
| --------------------------------------- | ------------------------------------------------------------------ | -------------------------------------------- |
| `AppLayout`, `AppSidebar`, `AIChatDock` | `AppLayout.test.tsx`, `AppSidebar.test.tsx`, `AIChatDock.test.tsx` | ✅ 新規                                      |
| `Header`                                | `Header/index.test.tsx`                                            | ✅ 新規                                      |
| `useContainerColumns`                   | `useContainerColumns.test.tsx`                                     | ✅ 新規                                      |
| `NoteView` 一式                         | `NoteView.test.tsx`, `noteViewHelpers.test.ts`                     | ✅ 新規                                      |
| `NoteSettings`                          | `NoteSettings.test.tsx`                                            | ✅ 新規                                      |
| `NoteMembers`                           | `NoteMembers.test.tsx`                                             | ✅ 新規                                      |
| `NotePageView`                          | `NotePageView.test.tsx`（更新）                                    | ✅ 既存更新                                  |
| `packages/ui` sidebar 分割              | （該当する単体テストは未確認）                                     | ⚠️ UI パッケージの直接テストは差分に含まれず |

## Lint / Format チェック

| コマンド                     | 結果                                                                                                                                                                                       |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `bun run format:check`       | **失敗** — 14 ファイルでスタイル不一致（`docs/plans/...`, `docs/specs/...`, `docs/reviews/review-develop-20250319-*.md`、複数の `*.test.tsx` / `noteViewHelpers.test.ts` 等）              |
| `bun run lint`（`eslint .`） | **ローカルでは失敗** — `.stryker-tmp` 配下が lint 対象に含まれるため（サンドボックス内の `@ts-nocheck` 等）。`.stryker-tmp` を削除した状態、または CI 相当のクリーン環境では別結果になる。 |

## 統計

- Critical: 1 件（format:check）
- Warning: 3 件（ファイルサイズ×2、eslint と `.stryker-tmp`）
- Info: 2 件

## 補足（セキュリティ・型）

- 変更範囲で `any` の新規使用は確認しなかった（grep 対象: `src/components/layout`, `src/pages/NoteView`）。
- ナビゲーション・ノート操作は既存の React Router / ミューテーション・トーストパターンに沿っている。

---

**次の確認（Step 4）**

1. **Critical**: Prettier を通してからコミット／PR 出しを推奨。
2. **Warning**: UI サイドバー分割の行数、`eslint` の `.stryker-tmp` 扱いを今のうちに直すか、後続タスクにするか決める。
