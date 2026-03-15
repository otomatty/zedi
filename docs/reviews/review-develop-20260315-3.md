# セルフレビュー: develop（未コミット変更）

**日時**: 2026-03-15
**ベース**: develop（作業ツリーの変更のみ）
**変更ファイル数**: 19 files
**関連ファイル数**: 20 files 程度

## サマリー

設定画面のリファクタとオンボーディングの拡張。General 設定を Profile / Display / Language / DataManagement / About の各カードに分割し、`ProfileFormFields` と `LanguageSelectField` をオンボーディングと設定で共有。セクション単位の保存状態表示（`SectionSaveStatus`）を導入。`SettingsOverview` はナビゲーション専用に整理され、`returnTo` 付きリンクをサポート。Critical（format）・Warning（Onboarding blob URL リーク）は対応済み。

## ファイルサイズ

| ファイル                                          | 行数 | 判定 |
| ------------------------------------------------- | ---- | ---- |
| src/components/settings/SettingsOverview.tsx      | 64   | OK   |
| src/components/settings/AISettingsForm.tsx        | 171  | OK   |
| src/components/settings/GeneralSettingsForm.tsx   | 150  | OK   |
| src/components/settings/StorageSettingsForm.tsx   | 127  | OK   |
| src/components/settings/useAISettingsForm.ts      | 174  | OK   |
| src/components/settings/useStorageSettingsForm.ts | 102  | OK   |
| src/pages/Settings.tsx                            | 101  | OK   |
| src/pages/Onboarding.tsx                          | 196  | OK   |
| src/components/settings/AboutCard.tsx             | 40   | OK   |
| src/components/settings/DataManagementCard.tsx    | 102  | OK   |
| src/components/settings/DisplaySettingsCard.tsx   | 137  | OK   |
| src/components/settings/LanguageSelectField.tsx   | 58   | OK   |
| src/components/settings/LanguageSettingsCard.tsx  | 30   | OK   |
| src/components/settings/ProfileFormFields.tsx     | 124  | OK   |
| src/components/settings/ProfileSettingsCard.tsx   | 49   | OK   |
| src/components/settings/SectionSaveStatus.tsx     | 46   | OK   |
| src/components/settings/SettingsOverview.test.tsx | 49   | OK   |

## 指摘事項

### 🔴 Critical（マージ前に修正必須）

| #   | ファイル         | 行  | 観点             | 指摘内容                                                                                                                                                                                                                               | 推奨修正                                                                     | 対応        |
| --- | ---------------- | --- | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ----------- |
| 1   | 変更ファイル一式 | -   | プロジェクト規約 | `bun run format:check` が失敗。変更内の以下のファイルで Prettier のフォーマットが未適用: AISettingsForm.tsx, DisplaySettingsCard.tsx, GeneralSettingsForm.tsx, LanguageSelectField.tsx, ProfileFormFields.tsx, StorageSettingsForm.tsx | リポジトリルートで `bun run format` を実行し、上記ファイルをフォーマットする | ✅ 対応済み |

### 🟡 Warning（修正を推奨）

| #   | ファイル                 | 行    | 観点           | 指摘内容                                                                                                                                                                                            | 推奨修正                                                                                        | 対応        |
| --- | ------------------------ | ----- | -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ----------- |
| 1   | src/pages/Onboarding.tsx | 41–49 | パフォーマンス | `handleAvatarFileChange` で `URL.createObjectURL(file)` した blob URL を、新しいファイル選択時やアンマウント時に `URL.revokeObjectURL` していない。繰り返し画像を差し替えると blob URL がリークする | GeneralSettingsForm と同様に、前回の blob URL を ref で保持し、変更時・unmount 時に revoke する | ✅ 対応済み |

### 🟢 Info（任意の改善提案）

| #   | ファイル                                      | 行  | 観点   | 指摘内容                                                                                                                                                                                       | 推奨修正                                                                                                                               |
| --- | --------------------------------------------- | --- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | 新規カード群                                  | -   | テスト | AboutCard, DataManagementCard, DisplaySettingsCard, LanguageSettingsCard, ProfileSettingsCard, SectionSaveStatus に専用単体テストはない。Settings.test や Onboarding.test で間接的に触れている | 必要に応じて主要カードのスナップショット or 表示テストを追加                                                                           |
| 2   | src/components/settings/ProfileFormFields.tsx | 112 | 可読性 | `fileInputRef as React.RefObject<HTMLInputElement>` のキャストで ref 型を合わせている                                                                                                          | 型定義を `RefObject<HTMLInputElement \| null>` のまま受け取り、input の ref に渡す共通型（例 `Ref<HTMLInputElement>`）を検討してもよい |

## テストカバレッジ

| 変更ファイル                                                                                                     | テストファイル               | 状態                                                    |
| ---------------------------------------------------------------------------------------------------------------- | ---------------------------- | ------------------------------------------------------- |
| SettingsOverview.tsx                                                                                             | SettingsOverview.test.tsx    | ✅ 既存テストあり                                       |
| GeneralSettingsForm.tsx                                                                                          | Settings.test.tsx（モック）  | ✅ ページ経由で間接的にカバー                           |
| AISettingsForm.tsx                                                                                               | Settings.test.tsx（モック）  | ✅ 同上                                                 |
| StorageSettingsForm.tsx                                                                                          | StorageSettingsForm.test.tsx | ✅ 既存テストあり                                       |
| Onboarding.tsx                                                                                                   | Onboarding.test.tsx          | ✅ 既存テストあり                                       |
| AboutCard, DataManagementCard, DisplaySettingsCard, LanguageSettingsCard, ProfileSettingsCard, SectionSaveStatus | -                            | ⚠️ 専用テスト未作成（Settings/Onboarding 経由で使用）   |
| useAISettingsForm.ts / useStorageSettingsForm.ts                                                                 | -                            | ⚠️ フォームテストでモック利用のため hook 単体テストなし |

## Lint / Format チェック

- **ESLint**: `bun run lint` → 成功（exit 0）。変更ファイル（src/components/settings, src/pages）からは **warning 0 件**。
- **Prettier**: `bun run format` 実行済み。変更ファイルはフォーマット適用済み。

## Lint warning 対応方針（本 PR 以外の警告について）

`bun run lint` で出る warning は **admin/** と **packages/ui/** に集中している（主に `jsdoc/require-jsdoc`、一部 `react-refresh/only-export-components`、`react-hooks/exhaustive-deps`）。

| 方針                    | 内容                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **今回の変更範囲**      | src/ の変更ファイルでは lint warning は発生していない。未使用 import（Onboarding の `UILocale`）は削除済み。                                                                                                                                                                                                                                                                                                                                                                                 |
| **既存 warning の扱い** | admin / packages/ui の JSDoc 不足は既存コードであり、本 PR では触れない。                                                                                                                                                                                                                                                                                                                                                                                                                    |
| **今後の対応案**        | (1) **別 PR で対応**: `chore: add JSDoc to admin and packages/ui` で require-jsdoc を満たす。(2) **ルール緩和**: 対象ディレクトリで `require-jsdoc` を off または warn のまま運用し、新規コードのみ JSDoc を付ける方針を AGENTS.md に明記する。(3) **CI で新規のみ検知**: `eslint --max-warnings 0` を CI で使い、warning 増加を禁止する（既存件数ベースラインを許容する場合は `--max-warnings N` で N を設定）。推奨は (2) または (3) で既存を許容しつつ、新規は warning を増やさない運用。 |

## 統計

- Critical: 1 件
- Warning: 1 件
- Info: 2 件
