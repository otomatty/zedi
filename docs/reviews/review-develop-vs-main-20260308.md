# セルフレビュー: develop（main との差分）

**日時**: 2026-03-08 14:13
**ベース**: main (`b823291`)
**変更**: 60 files
**レビュー範囲**: すべての変更（`main..develop`）
**比較対象**: develop
**関連ファイル数**: 20 files（実装リスクの高いコード/テストを優先。docs / workflow / `.cursor` は抜粋確認）

## サマリー

`develop` には、`admin` の AI モデル管理 UI 拡張、`server/api` の AI モデル同期ロジック分割、`TiptapEditor` の WikiLink 作成ダイアログ差し替えと無限ループ修正、画像アップロード時のクライアント側 WebP 変換、CI / ドキュメント / Cursor スキル更新が含まれる。  
UI 分割と純粋関数テストの追加で保守性は改善している一方、WikiLink の再クリック時キャッシュ、AI モデル同期の退役モデル扱い、同期プレビューモーダルのキーボード操作、そして Prettier 未整形がレビュー上の主な懸念点として残った。

## ファイルサイズ

| ファイル                                                      | 行数 | 判定                              |
| ------------------------------------------------------------- | ---: | --------------------------------- |
| `admin/src/pages/ai-models/index.tsx`                         |  129 | OK                                |
| `admin/src/pages/ai-models/AiModelsContent.tsx`               |  152 | OK                                |
| `server/api/src/services/syncAiModels.ts`                     |  249 | OK（分割により 250 行未満へ改善） |
| `server/api/src/services/syncAiModelsFetch.ts`                |  151 | OK                                |
| `server/api/src/services/syncAiModelsPricing.ts`              |  137 | OK                                |
| `src/components/editor/TiptapEditor.tsx`                      |  271 | Warning: 250 行超                 |
| `src/components/editor/TiptapEditor/useSuggestionEffects.ts`  |  136 | OK                                |
| `src/components/editor/TiptapEditor/useWikiLinkNavigation.ts` |  101 | OK                                |
| `admin/src/pages/ai-models/SyncPreviewModal.tsx`              |   96 | OK                                |
| `src/lib/storage/convertToWebP.ts`                            |   65 | OK                                |

## 指摘事項

### 🔴 Critical

- **C-1** `multiple files` — `bun run format:check` が失敗しており、変更範囲に 21 ファイルの未整形が残っている。
  → 少なくとも差分に含まれる未整形ファイルを `prettier --write` で整形してからマージすること。今回の差分では `admin/src/pages/ai-models/*`、`server/api/src/services/syncAiModels*.ts`、`.cursor/skills/review-local-changes/*`、`docs/reviews/review-develop-vs-main-20250308.md` などが対象。

### 🟡 Warning

- **W-1** `src/components/editor/TiptapEditor/useWikiLinkNavigation.ts:50` — `usePageByTitle()` の結果を `isFetched` だけで即座に判定している一方、`useCreatePage()` 側では `byTitle` キャッシュを invalidate していないため、いったん「未存在」と判定されたタイトルを作成した後に同じ WikiLink を再度クリックすると、古いキャッシュを見て再び「ページを作成しますか？」ダイアログを開く可能性がある。
  → `src/hooks/usePageQueries.ts` の `useCreatePage()` 成功時に `["pages", "byTitle", userId, title]` も更新/invalidte するか、`useWikiLinkNavigation()` 側で `isFetching` 完了まで待ってから未存在判定するテストケースを追加する。

- **W-2** `server/api/src/services/syncAiModels.ts:167` — `main` では provider から消えたモデルや allowlist から外れたモデルを非アクティブ化していたが、`develop` の `syncAiModels()` は「既存 ID は skip、新規のみ insert」に変わっており、退役モデルや除外対象が永続的に残る。
  → 既存の `displayName` / `tierRequired` / `isActive` を上書きしない方針は維持しつつ、今回取得できなかった ID だけは `isActive=false` にするか、少なくとも「同期対象外になったモデル」を別結果として返して管理画面で明示する。

- **W-3** `admin/src/pages/ai-models/SyncPreviewModal.tsx:23` — 新規追加の同期プレビューモーダルは `role="dialog"` だけで、初期フォーカス・Tab トラップ・Escape クローズ・フォーカス復帰がない。マウス操作では使えるが、キーボード操作とアクセシビリティ面では既存ダイアログより弱い。
  → `CreatePageDialog` で追加した `useDialogFocusTrap` 相当の仕組みを使うか、既存のダイアログコンポーネントに寄せて一貫したモーダル挙動にする。

- **W-4** `src/components/editor/TiptapEditor.tsx:45` — ファイルは 271 行、メインコンポーネント関数は lint 上 214 行で、今回の差分でも `bun run lint` の `max-lines-per-function` 警告が残っている。
  → `CreatePageDialog` / `useSuggestionEffects` まで分割済みなので、次段としてモーダル群や toolbar 周辺の表示責務を `components` / `hooks` に分離すると今後の変更で崩れにくい。

### 🟢 Info

- **I-1** `e2e/wikilink-create-dialog.spec.ts:93` — `waitForTimeout(500)` / `waitForTimeout(300)` に依存した待機が残っている。
  → 今回の E2E は通ったが、イベントベース待機に寄せると flake をさらに減らしやすい。

- **I-2** `server/api/src/services/syncAiModelsFilters.test.ts` / `server/api/src/services/syncAiModelsPricing.test.ts` — 純粋関数テストは追加されているが、`previewSyncAiModels()` / `syncAiModels()` の DB 更新方針（新規追加、既存 skip、退役モデル扱い）を担保する統合テストはまだない。
  → 今回の仕様変更点に直結するため、DB モックまたはテスト DB を使った 1 本を追加すると回帰検知が強くなる。

## テストカバレッジ

| 変更ファイル                                                  | テストファイル                                                     | 状態                |
| ------------------------------------------------------------- | ------------------------------------------------------------------ | ------------------- |
| `admin/src/api/admin.ts`                                      | `admin/src/api/admin.test.ts`                                      | ✅ 追加済み         |
| `admin/src/pages/ai-models/SyncPreviewModal.tsx`              | `admin/src/pages/ai-models/SyncPreviewModal.test.tsx`              | ✅ 追加済み         |
| `server/api/src/services/syncAiModelsFilters.ts`              | `server/api/src/services/syncAiModelsFilters.test.ts`              | ✅ 追加済み         |
| `server/api/src/services/syncAiModelsPricing.ts`              | `server/api/src/services/syncAiModelsPricing.test.ts`              | ✅ 追加済み         |
| `server/api/src/services/syncAiModels.ts`                     | -                                                                  | ⚠️ 統合テスト未作成 |
| `src/components/editor/TiptapEditor/CreatePageDialog.tsx`     | `src/components/editor/TiptapEditor/CreatePageDialog.test.tsx`     | ✅ 追加済み         |
| `src/components/editor/TiptapEditor/suggestionStateUtils.ts`  | `src/components/editor/TiptapEditor/suggestionStateUtils.test.ts`  | ✅ 追加済み         |
| `src/components/editor/TiptapEditor/useDialogFocusTrap.ts`    | `src/components/editor/TiptapEditor/useDialogFocusTrap.test.tsx`   | ✅ 追加済み         |
| `src/components/editor/TiptapEditor/useSuggestionEffects.ts`  | `src/components/editor/TiptapEditor/useSuggestionEffects.test.ts`  | ✅ 追加済み         |
| `src/components/editor/TiptapEditor/useWikiLinkNavigation.ts` | `src/components/editor/TiptapEditor/useWikiLinkNavigation.test.ts` | ✅ 追加済み         |
| `e2e/wikilink-create-dialog.spec.ts`                          | 同ファイル                                                         | ✅ 新規 E2E 追加    |
| `src/lib/storage/convertToWebP.ts`                            | `src/lib/storage/convertToWebP.test.ts`                            | ✅ 追加済み         |

## 静的解析

- **Lint**: 0 errors / 58 warnings（リポジトリ全体）。差分に直接関係する警告は `src/components/editor/TiptapEditor.tsx` の `max-lines-per-function`。
- **型チェック**: 未実施。
- **Prettier**: `bun run format:check` が失敗。差分内で 21 files が未整形。

## 実行したテスト

- `bun run test:run -- "src/components/editor/TiptapEditor/CreatePageDialog.test.tsx" "src/components/editor/TiptapEditor/suggestionStateUtils.test.ts" "src/components/editor/TiptapEditor/useDialogFocusTrap.test.tsx" "src/components/editor/TiptapEditor/useSuggestionEffects.test.ts" "src/components/editor/TiptapEditor/useWikiLinkNavigation.test.ts" "src/lib/storage/convertToWebP.test.ts"` → 40 tests passed
- `bun run test:run` in `admin/` → 18 tests passed
- `bun test "src/services/syncAiModelsFilters.test.ts" "src/services/syncAiModelsPricing.test.ts"` in `server/api/` → 39 tests passed

## 統計

- Critical: 1 件
- Warning: 4 件
- Info: 2 件
