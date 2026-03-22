# Self-review / セルフレビュー: `feature/test-mutation-roadmap-logic-395` (PR #398)

**Date / 日時**: 2026-03-23 (metadata refresh; original capture was 2025-03-22 on local `develop` with uncommitted work / メタデータ更新。元の記録は 2025-03-22 のローカル `develop` 未コミット作業向け)  
**Base / ベース**: `develop` (PR targets `develop` / PR は `develop` 向け)  
**Branch / ブランチ**: `feature/test-mutation-roadmap-logic-395` (tracked in PR #398 / PR #398 で追跡)

**Change files (historical note) / 変更ファイル数（当時）**: 22 tracked + 5 untracked = **27 files**  
**Related files reviewed / 関連ファイル数**: ~**18** major files (cap) / 主要ファイル約 18（上限内）

**Output / 出力先**: Per [AGENTS.md](../AGENTS.md), reviews live under `journal/` (not `docs/reviews/`). / レビューは `journal/` に保存（`docs/reviews/` は使わない）。

## Summary / サマリー

**English:** This note was originally a self-review of uncommitted AI-chat page streaming work on `develop`. PR [#398](https://github.com/otomatty/zedi/pull/398) carries the merged feature branch; keep this file as historical context or align metadata with the PR as done above.

**日本語:** 本メモは当初、ローカル `develop` 上の未コミット変更（AI チャットからのページ本文ストリーミング等）のセルフレビュー記録です。実装は PR [#398](https://github.com/otomatty/zedi/pull/398) のブランチに集約されているため、履歴として残すか、上記のとおり PR と整合するメタデータに更新してください。

AI チャットからの「ページ作成」を、空ページ作成後にエディタ側で **アウトライン＋会話文脈から Markdown をストリーミング生成**する流れに拡張している。`runAIChatAction` への抽出、`generateWikiContentFromChatOutlineStream` と各プロバイダ向けフルプロンプトストリーム、`usePendingChatPageGeneration` によるルータ state の受け渡しが中心。API では `GET /api/pages/:id/content` が **`page_contents` 未作成時に 404 ではなく空の ydoc を返す**ようになり、新規空ページと整合する。

## ファイルサイズ

| ファイル                                                         | 行数      | 判定                           |
| ---------------------------------------------------------------- | --------- | ------------------------------ |
| README.md                                                        | 259       | Warning: 250行超（分割を推奨） |
| src/lib/wikiGenerator/wikiGeneratorProviders.ts                  | 277       | Warning: 250行超（分割を推奨） |
| server/api/src/routes/pages.ts                                   | 239       | OK                             |
| src/hooks/runAIChatAction.ts                                     | 186       | OK                             |
| src/components/editor/PageEditor/usePendingChatPageGeneration.ts | 152       | OK                             |
| src/lib/wikiGenerator.ts                                         | 181       | OK                             |
| src/components/page/PageCard.tsx                                 | 248       | OK（境界）                     |
| その他変更ファイル                                               | 〜250未満 | OK                             |

## 指摘事項

### Critical（マージ前に修正必須）

| #   | ファイル           | 行  | 観点             | 指摘内容                                                                                                 | 推奨修正                                                                                                                                                         |
| --- | ------------------ | --- | ---------------- | -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | （リポジトリ全体） | -   | プロジェクト規約 | `bun run format:check` が **exit code 1**（75 ファイルで Prettier 不一致）。マージ前ゲートとしては失敗。 | 変更に含まれるファイルから `prettier --write` で直す。リポジトリ全体の既存差分は別タスクでも可だが、**この PR に触れたファイルはフォーマットを揃える**のが安全。 |

### Warning（修正を推奨）

| #   | ファイル                                                         | 行                          | 観点             | 指摘内容                                                                                                                                                                   | 推奨修正                                                                               |
| --- | ---------------------------------------------------------------- | --------------------------- | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| 1   | src/lib/wikiGenerator/wikiGeneratorProviders.ts                  | 全体                        | 可読性・保守性   | 277 行でストリーミング系が増え、250 行超。                                                                                                                                 | スキル推奨どおり、`stream*FullPrompt` を `wikiGeneratorStreamFullPrompt.ts` 等へ分割。 |
| 2   | README.md                                                        | 全体                        | 可読性・保守性   | 259 行で 250 行超（今回の差分で README が大きく動いている）。                                                                                                              | セクション分割や別ファイルへのリンク化（README 方針に合わせる）。                      |
| 3   | src/hooks/runAIChatAction.ts                                     | `handleCreateMultiplePages` | アーキテクチャ   | 複数ページ作成時、**ナビゲートとストリーミング対象は先頭の 1 ページ＋最初に `content` があるアウトライン**に寄せている。意図どおりならよいが、他ページは本文自動生成なし。 | プロダクト仕様として明文化（TSDoc）するか、各ページに応じた pending state を検討。     |
| 4   | src/components/editor/PageEditor/usePendingChatPageGeneration.ts | 96-101 付近                 | 可読性           | スロットル **150ms** がマジックナンバー。                                                                                                                                  | 名前付き定数（例 `EDITOR_STREAM_THROTTLE_MS`）に。                                     |
| 5   | src/types/aiChat.ts                                              | ESLint 報告行               | プロジェクト規約 | `eslint .` で当該ファイルに `jsdoc/require-jsdoc` 等の警告（変更範囲と重なる）。                                                                                           | export 型への TSDoc 追記（プロジェクト方針）。                                         |

### Info（任意の改善提案）

| #   | ファイル                        | 観点   | 指摘内容                                                                  | 推奨修正                                               |
| --- | ------------------------------- | ------ | ------------------------------------------------------------------------- | ------------------------------------------------------ |
| 1   | usePendingChatPageGeneration.ts | テスト | フック単体のユニットテストは未追加（ストリーム・navigate の結合が重い）。 | 必要なら `act`＋モックで最低限の分岐テスト。           |
| 2   | bun run lint                    | ノイズ | 0 errors / 2104 warnings で、多くは既存コードベースの JSDoc 警告。        | 変更ファイルに限定した lint クリーンアップは段階的に。 |

## テストカバレッジ

| 変更ファイル                                         | テストファイル                                            | 状態                                                        |
| ---------------------------------------------------- | --------------------------------------------------------- | ----------------------------------------------------------- |
| src/hooks/useAIChatActions.ts                        | src/hooks/useAIChatActions.test.ts                        | 実行済み ✅（27 件中関連 4 ファイルを実行、すべてパス）     |
| src/lib/aiChatActionHelpers.ts                       | src/lib/aiChatActionHelpers.test.ts                       | ✅                                                          |
| src/lib/wikiGenerator/wikiGeneratorFromChatPrompt.ts | src/lib/wikiGenerator/wikiGeneratorFromChatPrompt.test.ts | ✅ 新規                                                     |
| server/api/src/routes/pages.ts                       | （該当なし）                                              | ⚠️ ルートの挙動変更にサーバー側テストがない場合は追加を検討 |

## Lint / Format チェック

| コマンド               | 結果                                                                                                                                                                                   |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bun run lint`         | **exit 0**（warnings 多数、エラー 0）                                                                                                                                                  |
| `bun run format:check` | **exit 1** — 75 ファイルで Prettier 不一致。変更セットに含まれる例: `README.md`, `src/hooks/useAIChatConversations.ts`, `src/lib/aiChatPrompt.ts` など（ログ上の `[warn]` 一覧参照）。 |

## セキュリティ（簡易）

- **認可**: `pages.ts` の GET は従来どおりページ存在・所有者チェック後に応答。空 ydoc 返却は「ページあり・コンテンツ行なし」のみで、他ユーザーのページを読む経路は増えていない。
- **XSS**: 生成 Markdown → Tiptap 変換は既存フローに沿う。チャット・アウトラインをプロンプトに含めるのは AI 機能として想定内。

## 統計

- Critical: **1**（format:check 失敗）
- Warning: **5**
- Info: **2**
