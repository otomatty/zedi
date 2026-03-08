# セルフレビュー: develop（main との差分）

> **⚠️ 過去スナップショット**: このドキュメントは 2025-03-08 時点の状態を記録した履歴ファイルです。現行リリースの判定には使用しないでください。最新のレビュー結果は [review-develop-vs-main-20260308.md](./review-develop-vs-main-20260308.md) を参照してください。

**日時**: 2025-03-08
**ベース**: main (`b823291`)
**変更**: 42 files
**レビュー範囲**: すべての変更（main..develop）
**比較対象**: develop

## 指摘対応状況（2025-03-08 実施）

| #   | 重大度   | 指摘内容                           | 状態                                                                                                        |
| --- | -------- | ---------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| C-1 | Critical | syncAiModels.ts 400 行超           | 対応済み（types / filters / fetch / pricing に分割）                                                        |
| W-1 | Warning  | ai-models ファイル・関数過多       | 対応済み（SyncPreviewModal, useAiModelsDragReorder, AiModelRow, AiModelsContent, useAiModelActions に分割） |
| W-2 | Warning  | syncAiModels の complexity 26      | 対応済み（fetchAndFilterRows / syncOneProvider に切り出し）                                                 |
| W-3 | Warning  | TiptapEditor 250 行超・関数 214 行 | 未対応（ref とフックの結合が強いため別 PR で対応推奨）                                                      |

## サマリー

develop ブランチには、**AIモデル管理の拡張**（同期プレビュー・一括 sortOrder 更新・ドラッグ並び替え・表示名編集）、**WikiLink 作成ダイアログの差し替えと無限ループ修正**（サジェスト状態の同値比較・useSuggestionEffects の依存をプリミティブに変更・createPortal による自前ダイアログと useDialogFocusTrap）、**画像アップロード時のクライアント側 WebP 変換**、および **CI・ドキュメント・Cursor スキル** の更新が含まれる。サーバー側では syncAiModels が「既存は上書きしない・新規のみ追加・Sonnet 系は非アクティブ」に変更されている。

## ファイルサイズ

| ファイル                                                   | 行数 | 判定                                      |
| ---------------------------------------------------------- | ---- | ----------------------------------------- |
| admin/src/pages/ai-models/index.tsx                        | 394  | Warning: 250行超・関数 363 行（150 行超） |
| server/api/src/services/syncAiModels.ts                    | 684  | Critical: 400行超                         |
| src/components/editor/TiptapEditor.tsx                     | 271  | Warning: 250行超（既存の関数 214 行含む） |
| src/components/editor/TiptapEditor/CreatePageDialog.tsx    | 70   | OK                                        |
| src/components/editor/TiptapEditor/useDialogFocusTrap.ts   | 80   | OK                                        |
| src/components/editor/TiptapEditor/suggestionStateUtils.ts | 27   | OK                                        |
| src/lib/storage/convertToWebP.ts                           | 65   | OK                                        |
| e2e/wikilink-create-dialog.spec.ts                         | 211  | OK                                        |

## 指摘事項

### 🔴 Critical

- **C-1** `server/api/src/services/syncAiModels.ts` — ファイルが 684 行で 400 行を超えている（スキル基準: 400 行超は Critical）。
  → 責務ごとに分割を推奨。例: `fetchOpenAIModels` / `fetchAnthropicModels` / `fetchGoogleModels` と価格・allowlist 判定を別ファイル（例: `syncAiModelsProviders.ts`）、`previewSyncAiModels` と `syncAiModels` の共有ロジックを `syncAiModelsCore.ts` などに切り出し、本体はオーケストレーションのみにする。

### 🟡 Warning

- **W-1** `admin/src/pages/ai-models/index.tsx` — ファイル 394 行（250 行超）、かつコンポーネント関数が 363 行（150 行超）。ESLint `max-lines-per-function` に違反。
  → 同期プレビューモーダルを別コンポーネント（例: `SyncPreviewModal.tsx`）に切り出し、ドラッグ処理を `useAiModelsDragReorder` のような hook に分離することを推奨。

- **W-2** `server/api/src/services/syncAiModels.ts:554` — 関数 `syncAiModels` の循環的複雑度が 26（ESLint 上限 20）。
  → プロバイダーごとの処理を内部関数または別関数に切り出し、分岐を減らす。

- **W-3** `src/components/editor/TiptapEditor.tsx` — ファイル 271 行（250 行超）、メインコンポーネント 214 行（150 行超）。既存指摘と同様。
  → 既存の分割方針に沿い、さらに UI ブロックごとのサブコンポーネント化を検討。

### 🟢 Info

- **I-1** `admin/src/pages/ai-models/index.tsx`・`server/api/src/services/syncAiModels.ts` — 単体テストが存在しない。
  → 管理画面の API 呼び出しや sync の主要パスにテストを追加すると、リグレッション防止に役立つ。

- **I-2** `e2e/wikilink-create-dialog.spec.ts` — `page.waitForTimeout` に依存している箇所がある。
  → 可能であれば `expect` や `waitForSelector` などイベントベースの待機に置き換えると flake が減りやすい。

- **I-3** `src/lib/storage/convertToWebP.ts` — 非 WebP 対応環境では元ファイルをそのまま返すフォールバックになっている。
  → 仕様として問題なし。必要ならログやメトリクスでフォールバック率を把握する余地あり。

## テストカバレッジ

| 変更ファイル                                                | テストファイル                                           | 状態                                |
| ----------------------------------------------------------- | -------------------------------------------------------- | ----------------------------------- |
| admin/src/pages/ai-models/index.tsx                         | -                                                        | 未（SyncPreviewModal で一部カバー） |
| admin/src/pages/ai-models/SyncPreviewModal.tsx              | SyncPreviewModal.test.tsx                                | 追加済み                            |
| admin/src/api/admin.ts                                      | admin.test.ts                                            | 追加済み                            |
| server/api/src/routes/ai/admin.ts                           | -                                                        | テスト未作成                        |
| server/api/src/services/syncAiModels.ts                     | syncAiModelsFilters.test.ts, syncAiModelsPricing.test.ts | 純粋関数のテスト追加済み            |
| src/components/editor/TiptapEditor.tsx                      | -                                                        | E2E でカバー                        |
| src/components/editor/TiptapEditor/CreatePageDialog.tsx     | CreatePageDialog.test.tsx                                | 既存テストあり                      |
| src/components/editor/TiptapEditor/suggestionStateUtils.ts  | suggestionStateUtils.test.ts                             | 既存テストあり                      |
| src/components/editor/TiptapEditor/useDialogFocusTrap.ts    | useDialogFocusTrap.test.tsx                              | 既存テストあり                      |
| src/components/editor/TiptapEditor/useSuggestionEffects.ts  | useSuggestionEffects.test.ts                             | 既存テストあり                      |
| src/components/editor/TiptapEditor/useWikiLinkNavigation.ts | useWikiLinkNavigation.test.ts                            | 既存テストあり                      |
| src/lib/storage/convertToWebP.ts                            | convertToWebP.test.ts                                    | 既存テストあり                      |
| e2e/wikilink-create-dialog.spec.ts                          | 同上                                                     | E2E 新規追加                        |

## 静的解析

- **Lint**: 0 errors / 60 warnings（リポジトリ全体）。変更ファイルに起因する警告: `admin/src/pages/ai-models/index.tsx` の max-lines-per-function、`server/api/src/services/syncAiModels.ts` の complexity、`src/components/editor/TiptapEditor.tsx` の max-lines-per-function（既存）。
- **型チェック**: 変更範囲のみ未実施（実行時は `tsc --noEmit` で確認推奨）。
- **Prettier**: 実行時により一部ファイルで未フォーマットの報告あり（`.cursor/skills/`、`admin/`、`AGENTS.md` 等）。develop ブランチで `bun run format:check` を実行し、必要なら `bun run format` で整形を推奨。

## 統計

- Critical: 1 件
- Warning: 3 件
- Info: 3 件
