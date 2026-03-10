# セルフレビュー: develop（ローカル変更）

**日時**: 2025-03-10
**ベース**: develop（未コミット変更を対象）
**変更ファイル数**: 30+ files（修正・削除・新規含む）
**関連ファイル数**: 20 files 以内で確認

## サマリー

設定画面を「Settings Hub」に統合する変更。従来の `/settings/ai`・`/settings/general`・`/settings/storage` を廃止し、単一ページ `/settings` でセクション（general / ai / storage）ごとにオーバービューとフォームを表示。`SettingsOverview`・`SettingsSection`・`useSettingsSummaries` を新設し、`AISettingsForm`・`StorageSettingsForm` は `embedded` モードでセクション内に埋め込み。AI 設定は `AISettingsFormServerSection`・`AISettingsFormUserKeySection`、ストレージは `GyazoSettings`・`GitHubSettings`・`GoogleDriveSettings` に分割。`App.tsx` のルートは `/settings` のみに整理。

## ファイルサイズ

| ファイル                                                | 行数    | 判定                              |
| ------------------------------------------------------- | ------- | --------------------------------- |
| src/components/settings/StorageSettingsForm.tsx         | 408     | 🔴 Critical: 400行超（分割必須）  |
| src/components/editor/MermaidGeneratorDialog.tsx        | 246     | 🟡 Warning: 250行超（分割を推奨） |
| src/components/settings/useAISettingsForm.ts            | 175     | OK                                |
| src/components/settings/AISettingsForm.tsx              | 159     | OK                                |
| src/components/settings/storage/GoogleDriveSettings.tsx | 137     | OK                                |
| その他（SettingsSection, SettingsOverview, hooks 等）   | 38〜131 | OK                                |

## 指摘事項

### 🔴 Critical（マージ前に修正必須）

| #   | ファイル                                                 | 行   | 観点             | 指摘内容                                                    | 推奨修正                                                                                                                                                                                                                                |
| --- | -------------------------------------------------------- | ---- | ---------------- | ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | src/components/settings/StorageSettingsForm.tsx          | 全体 | 可読性・保守性   | ファイルが 408 行で 400 行超。プロジェクト基準で Critical。 | `StorageDestinationSection`・`ExternalStorageProviderSelect`・`StorageProviderSpecificForms`・`StorageTestResultAndGuide` をそれぞれ別ファイル（例: `storage/StorageDestinationSection.tsx` 等）に切り出し、本体は 200 行以下に収める。 |
| 2   | src/components/settings/StorageSettingsForm.tsx          | -    | プロジェクト規約 | Prettier の format:check に未通過。                         | `bun run format` または `prettier --write src/components/settings/StorageSettingsForm.tsx` で整形する。                                                                                                                                 |
| 3   | src/components/settings/AISettingsFormUserKeySection.tsx | -    | プロジェクト規約 | Prettier の format:check に未通過。                         | 同上で整形する。                                                                                                                                                                                                                        |

### 🟡 Warning（修正を推奨）

| #   | ファイル                                         | 行                  | 観点           | 指摘内容                                                                                                                                                                                                                         | 推奨修正                                                                                                                       |
| --- | ------------------------------------------------ | ------------------- | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| 1   | src/components/editor/MermaidGeneratorDialog.tsx | 31                  | 可読性・保守性 | メインのアロー関数が 195 行で、ESLint max-lines-per-function（150 行）超過。ファイル自体も 246 行で 250 行超。                                                                                                                   | プレビュー用ロジック・ダイアログ本文・フッター等を子コンポーネントまたは `*Helpers.ts` に切り出し、1 関数 150 行以内に収める。 |
| 2   | src/components/settings/StorageSettingsForm.tsx  | 150,193,262,325,375 | アーキテクチャ | 1 ファイル内に 5 つの React コンポーネント（StorageDestinationSection, ExternalStorageProviderSelect, StorageProviderSpecificForms, StorageTestResultAndGuide, StorageSettingsFormContent）。ESLint react/no-multi-comp に抵触。 | 上記 Critical #1 の分割と合わせ、1 ファイル 1 コンポーネントにし、必要に応じて types を共有用に切り出す。                      |

### 🟢 Info（任意の改善提案）

| #   | ファイル                                     | 行    | 観点   | 指摘内容                                                                                                                                     | 推奨修正                                                                                      |
| --- | -------------------------------------------- | ----- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| 1   | src/components/settings/useAISettingsForm.ts | 72-74 | 可読性 | `useEffect` で `setUseOwnKey(settings.apiMode === "user_api_key")` を `isLoading` 依存で実行。初回ロード後に UI と設定を同期する意図は明確。 | コメントで「初回ロード後に apiMode に合わせて useOwnKey を同期」と書くと意図が伝わりやすい。  |
| 2   | src/pages/Settings.tsx                       | 18-20 | 可読性 | `isValidSection(s)` で URL の `section` を検証。`VALID_SECTIONS` と型で一貫している。                                                        | 特になし。必要なら `section` が不正な場合のフォールバック（例: general へ）を明示してもよい。 |

## テストカバレッジ

| 変更ファイル                                                  | テストファイル                                                     | 状態              |
| ------------------------------------------------------------- | ------------------------------------------------------------------ | ----------------- |
| src/lib/aiSettings.ts（間接）                                 | src/lib/aiSettings.test.ts                                         | ✅ 既存テストあり |
| src/pages/Settings.tsx                                        | src/pages/Settings.test.tsx                                        | ✅ 追加済み       |
| src/components/settings/SettingsOverview.tsx                  | src/components/settings/SettingsOverview.test.tsx                  | ✅ 追加済み       |
| src/components/settings/SettingsSection.tsx                   | src/components/settings/SettingsSection.test.tsx                   | ✅ 追加済み       |
| src/components/settings/useSettingsSummaries.ts               | src/components/settings/useSettingsSummaries.test.ts               | ✅ 追加済み       |
| src/components/settings/StorageSettingsForm.tsx               | src/components/settings/StorageSettingsForm.test.tsx               | ✅ 追加済み       |
| src/components/settings/storage/StorageDestinationSection.tsx | src/components/settings/storage/StorageDestinationSection.test.tsx | ✅ 追加済み       |
| src/components/editor/MermaidGeneratorDialog.tsx              | src/components/editor/MermaidGeneratorDialog.test.tsx              | ✅ 追加済み       |
| src/components/editor/MermaidGeneratorNotConfiguredView.tsx   | src/components/editor/MermaidGeneratorNotConfiguredView.test.tsx   | ✅ 追加済み       |
| src/components/editor/MermaidGeneratorFormFields.tsx          | src/components/editor/MermaidGeneratorFormFields.test.tsx          | ✅ 追加済み       |
| src/components/editor/MermaidGeneratorResultPreview.tsx       | src/components/editor/MermaidGeneratorResultPreview.test.tsx       | ✅ 追加済み       |
| src/components/settings/AISettingsForm.tsx                    | -                                                                  | ⚠️ 任意           |
| src/components/settings/useAISettingsForm.ts                  | -                                                                  | ⚠️ 任意           |
| src/components/settings/useStorageSettingsForm.ts             | -                                                                  | ⚠️ 任意           |

## Lint / Format チェック

- **`bun run lint`**: 0 errors, 91 warnings（本変更で新規の error はなし。StorageSettingsForm は react/no-multi-comp の既存方針に沿った警告。MermaidGeneratorDialog の max-lines-per-function は既存ファイルの警告。）
- **`bun run format:check`**: ❌ 失敗。未整形: `src/components/settings/AISettingsFormUserKeySection.tsx`, `src/components/settings/StorageSettingsForm.tsx`, `docs/reviews/review-develop-20250310-1.md`

## セキュリティ・設計メモ

- **returnTo 検証**: `useStorageSettingsForm` と `useAISettingsForm` の `getSafeReturnTo` で `returnTo.startsWith("/")` かつ `!returnTo.startsWith("//")` をチェックしており、オープンリダイレクト対策として妥当。
- **型**: 変更した settings 関連コードに `any` の使用はなし。TypeScript strict に準拠。

## 統計

- Critical: 3 件
- Warning: 2 件
- Info: 2 件

---

## 対応履歴（2025-03-10）

- **Critical**: Prettier 未整形 → `bun run format` で解消。StorageSettingsForm を `storage/StorageDestinationSection.tsx`・`ExternalStorageProviderSelect.tsx`・`StorageProviderSpecificForms.tsx`・`StorageTestResultAndGuide.tsx`・`storageSettingsFormTypes.ts` および `StorageSettingsFormContent.tsx` に分割し、本体を 120 行以下に削減。
- **Warning**: MermaidGeneratorDialog を `MermaidGeneratorNotConfiguredView.tsx`・`MermaidGeneratorFormFields.tsx`・`MermaidGeneratorResultPreview.tsx` に分割し、メインコンポーネントを 150 行以内に収めた。`bun run lint`（0 errors）・`bun run format:check` 通過を確認。
