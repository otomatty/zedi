# 設定画面 UX 再設計の調査

**日時**: 2026-03-14
**対象**: `/settings` ハブページおよび関連コンポーネント

## 1. 現状の実装構造

- **ルート**: `src/pages/Settings.tsx` — 単一ページ、`SettingsOverview` + 3 セクション（general / ai / storage）
- **オーバービュー**: `SettingsOverview.tsx` — 各セクションへのカードリンク（title, description, summary）
- **セクション**: `SettingsSection.tsx` — 各セクションの見出し（title, description, summary）+ 子フォーム
- **サマリー生成**: `useSettingsSummaries.ts` — theme/font/locale/profile, AI mode/model/status, storage dest/status を結合

## 2. 根拠付き課題一覧

### 2.1 情報の重複表示

| 場所             | 表示内容                            | 根拠コード                                                         |
| ---------------- | ----------------------------------- | ------------------------------------------------------------------ |
| SettingsOverview | `title` + `description` + `summary` | `SettingsOverview.tsx:54-57` — CardTitle, CardDescription, summary |
| SettingsSection  | `title` + `description` + `summary` | `SettingsSection.tsx:27-33` — h2, p, summary                       |
| Settings.tsx     | `summaries` を両方に渡している      | `Settings.tsx:66-93` — Overview と Section に同一 summaries を渡す |

**問題**: 同一セクション（例: AI）をクリックしてスクロールすると、オーバービューとセクション両方に同じ説明・要約が表示される。モバイルで縦スクロールが長いと冗長に感じる。

### 2.2 保存時の通知過多（入力体験がノイジー）

| コンポーネント                               | 保存トリガー     | フィードバック        | 根拠                                                                           |
| -------------------------------------------- | ---------------- | --------------------- | ------------------------------------------------------------------------------ |
| GeneralSettingsForm                          | デバウンス 800ms | `toast.success`       | `GeneralSettingsForm.tsx:372-377`, `useDebouncedCallback(runProfileSave, 800)` |
| AISettingsForm (useAISettingsForm)           | デバウンス 800ms | `sonnerToast.success` | `useAISettingsForm.ts:73-89`, `useDebouncedCallback(runSave, 800)`             |
| StorageSettingsForm (useStorageSettingsForm) | デバウンス 800ms | `sonnerToast.success` | `useStorageSettingsForm.ts:27-42`, `useDebouncedCallback(runSave, 800)`        |

**問題**: 複数フィールドを連続で編集すると、デバウンスごとに Toast が表示され、通知が頻発する。特に AI/Storage は provider / model / apiKey などを変更するたびに保存が走る。

### 2.3 画面責務の重複（オンボーディング vs 一般設定）

| 項目                             | Onboarding.tsx | GeneralSettingsForm.tsx                          | 根拠                                                        |
| -------------------------------- | -------------- | ------------------------------------------------ | ----------------------------------------------------------- |
| プロフィール（表示名・アバター） | Step 1 で表示  | `GeneralSettingsProfileCard`                     | `Onboarding.tsx:110-189`, `GeneralSettingsForm.tsx:49-118`  |
| 言語                             | Step 2 で表示  | `GeneralSettingsDisplayCards` 内の Language Card | `Onboarding.tsx:192-220`, `GeneralSettingsForm.tsx:236-258` |

**問題**: プロフィール・言語の UI が別々に実装されており、文言・バリデーション・保存導線が二重管理になっている。Onboarding は `updateProfile` / `saveProfile`、General は `updateProfileAndSave` + debounce で、導線が異なる。

### 2.4 コンポーネント肥大化（保守性）

| ファイル                | 行数 | 判定                  |
| ----------------------- | ---- | --------------------- |
| GeneralSettingsForm.tsx | 474  | 250行超（分割を推奨） |

**問題**: `GeneralSettingsProfileCard` / `GeneralSettingsDisplayCards` / `DataManagementCard` / About Card が同一ファイルに集約されており、UX 再設計時の変更コストが高い。既存レビュー（`review-develop-20250310-2.md`）でも StorageSettingsForm の分割が推奨され、同様のパターンが General にも適用可能。

## 3. 影響ファイル一覧

| ファイル                                            | 役割                           |
| --------------------------------------------------- | ------------------------------ |
| `src/pages/Settings.tsx`                            | ハブページ本体                 |
| `src/components/settings/SettingsOverview.tsx`      | オーバービューカード           |
| `src/components/settings/SettingsSection.tsx`       | セクションラッパー             |
| `src/components/settings/useSettingsSummaries.ts`   | サマリー生成                   |
| `src/components/settings/GeneralSettingsForm.tsx`   | 一般設定フォーム               |
| `src/components/settings/useAISettingsForm.ts`      | AI フォーム orchestration      |
| `src/components/settings/useStorageSettingsForm.ts` | Storage フォーム orchestration |
| `src/pages/Onboarding.tsx`                          | 初回設定ウィザード             |

## 4. 参照

- [review-develop-20250310-2.md](../reviews/review-develop-20250310-2.md) — Settings Hub 統合時のレビュー、StorageSettingsForm 分割推奨
- [AGENTS.md](../../AGENTS.md) — プロジェクト規約（250行超 Warning、400行超 Critical）
