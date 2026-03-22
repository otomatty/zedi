# セルフレビュー: feature/test-mutation-roadmap-logic-395

**日時**: 2026-03-22（実行時）
**ベース**: develop
**変更ファイル数**: 25 files（`git diff develop --name-only`）
**関連ファイル数**: 約 18（主要差分・テスト・呼び出し関係を優先して読了）

> 出力先: リポジトリ方針により `docs/reviews/` ではなく `journal/` に保存（[AGENTS.md](../AGENTS.md)）。

## サマリー

`develop` 比では、AI チャットからの新規ページ作成後にエディタ側で本文をストリーム生成する流れ（`PendingChatPageGenerationState`、`runAIChatAction`、`usePendingChatPageGeneration`、Wiki ジェネレータ拡張）と、Stryker 差分・E2E・サーバーテスト・境界テストの追加がまとまっている。`usePageEditorAIEffects` で `usePageEditorEffects` と pending 本文ストリーム用フックを合成し、`usePageEditorStateAndSync` はその合成フックを呼ぶだけに整理されている。

## ファイルサイズ

| ファイル                                                           | 行数 | 判定                            |
| ------------------------------------------------------------------ | ---- | ------------------------------- |
| `src/components/editor/PageEditor/usePageEditorStateAndSync.ts`    | 273  | Warning: 250 行超（分割を推奨） |
| `src/components/editor/PageEditor/usePendingChatPageGeneration.ts` | 156  | OK                              |
| `src/hooks/runAIChatAction.ts`                                     | 192  | OK                              |
| `src/lib/wikiGenerator.ts`                                         | 180  | OK                              |
| `scripts/stryker-mutation-report-summarize.mjs`                    | 229  | OK                              |
| `src/components/editor/PageEditor/usePageEditorAIEffects.ts`       | 21   | OK                              |

## 指摘事項

### Critical（マージ前に修正必須）

| #   | ファイル           | 行  | 観点             | 指摘内容                                                                                                                                                                                                              | 推奨修正                                                                                                                                                  |
| --- | ------------------ | --- | ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | （リポジトリ全体） | —   | プロジェクト規約 | `bun run format:check` が **exit code 1**（Prettier が 100 ファイルで不一致）。差分に含まれる `usePageEditorEffects.ts`、`usePageEditorStateAndSync.ts`、`aiChatActionHelpers.ts`、`aiChat.ts` 等も警告一覧に含まれる | ブランチで触ったファイルは `prettier --write` で整形し、CI の format 要件に合わせる。全体 100 件はベースラインだが、PR では変更ファイルの整形を必須とする |

### Warning（修正を推奨）

| #   | ファイル                          | 行    | 観点             | 指摘内容                                                                                       | 推奨修正                                                                                                               |
| --- | --------------------------------- | ----- | ---------------- | ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| 1   | `usePageEditorStateAndSync.ts`    | 全体  | 可読性・保守性   | 273 行。slice 用の補助型・関数で末尾が膨らんでいる                                             | 既存パターンに沿い、`pageEditor*Slice` を別ファイルへ出すか、Wiki/削除スライスだけ分離を検討                           |
| 2   | `usePendingChatPageGeneration.ts` | 全体  | テスト           | 専用の `*.test.ts(x)` がなく、挙動は `runAIChatAction.test.ts` と E2E に依存                   | ルータ state の取り込み・離脱時クリア・dedupe を `renderHook` + `MemoryRouter` でユニット化すると回 regressions に強い |
| 3   | `src/types/aiChat.ts`             | 32–61 | プロジェクト規約 | ESLint が `ChatAction` 関連インターフェースに `jsdoc/require-jsdoc` を出している（変更行付近） | 他の型と同様、公開インターフェースに短い英日 TSDoc を付与                                                              |

### Info（任意の改善提案）

| #   | ファイル                          | 行      | 観点           | 指摘内容                                                                                                 | 推奨修正                                                                        |
| --- | --------------------------------- | ------- | -------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| 1   | `runAIChatAction.ts`              | 187–190 | アーキテクチャ | `switch` の `default` で `never` 検査後、実行時に未知の `action.type` が来ると無言で no-op               | 開発時のみ `console.warn` や `exhaustive` assert を検討（本番ではノイズに注意） |
| 2   | `usePendingChatPageGeneration.ts` | 98–105  | パフォーマンス | チャンクごとに `setTimeout` を張り替えるスロットルは妥当だが、非常に細かいチャンクではタイマーが多くなる | 現状 150ms で十分実用的。問題が出たら rAF バッチ等を検討                        |

## テストカバレッジ

| 変更ファイル                      | テストファイル                                                 | 状態                                       |
| --------------------------------- | -------------------------------------------------------------- | ------------------------------------------ |
| `src/lib/aiChatActionHelpers.ts`  | `aiChatActionHelpers.test.ts`                                  | 既存＋拡張あり                             |
| `src/lib/aiChatPrompt.ts`（周辺） | `aiChatPrompt.test.ts`                                         | あり                                       |
| `src/lib/wikiGenerator.ts` 等     | `wikiGenerator.test.ts`, `wikiGeneratorFromChatPrompt.test.ts` | あり                                       |
| `src/hooks/runAIChatAction.ts`    | `runAIChatAction.test.ts`                                      | あり                                       |
| `e2e/ai-chat-panel.spec.ts`       | E2E                                                            | あり                                       |
| `server/api/.../pages.test.ts` 等 | API テスト                                                     | あり                                       |
| `usePageEditorAIEffects.ts`       | —                                                              | 薄い合成のため実害は小さいが専用テストなし |
| `usePendingChatPageGeneration.ts` | —                                                              | ⚠️ 専用ユニットなし（上記 Warning）        |

## Lint / Format チェック

- **`bun run lint`**: 終了コード 0。**エラー 0**、警告多数（プロジェクト全体のベースライン、JSDoc 等）。
- **`bun run format:check`**: **失敗**（exit code 1）。「100 files」で Prettier 不一致。

## 統計

- Critical: **1**（`format:check` 失敗 ※リポジトリ全体の未整形を含む）
- Warning: **3**
- Info: **2**

## セキュリティ・設計（短文）

- **XSS**: ストリーム本文は既存の Markdown→Tiptap 変換・エディタ表示経路に乗る想定。新規で `dangerouslySetInnerHTML` 等は見当たらない。
- **認可**: ページ作成・遷移は既存ミューテーション・セッションに依存。
- **ルータ state**: `pendingChatPageGeneration` は `useLayoutEffect` で即 `replace` により URL バーに残しにくく、離脱時は ref をクリアする設計。

---

## 事後アクション（スキル Step 4）

1. **Critical**（`format:check` と、このブランチで変更したファイルの Prettier 整合）を今すぐ直すか。
2. **Warning**（`usePageEditorStateAndSync` の行数、`usePendingChatPageGeneration` のテスト、型への JSDoc）も併せて直すか。

ご希望があれば、対象ファイルに絞って `prettier --write` とテスト追加までこちらで進めます。
