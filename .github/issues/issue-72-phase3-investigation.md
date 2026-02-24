# Issue #72 作業用調査メモ（Phase 3: 複雑度・可読性の改善）

**Issue:** [otomatty/zedi#72](https://github.com/otomatty/zedi/issues/72) — [Phase 3] 複雑度・可読性の改善（長大関数・ネスト深度）  
**親 Issue:** #69 [方針] ESLint/Prettier に基づく今後の実装方針  
**調査日:** 2026-02-24

---

## 1. Issue #72 の要約

- **目的:** `complexity` / `max-lines-per-function` / `max-depth` の ESLint 警告を解消し、可読性・保守性を上げる。
- **対象ルール:**
  - `complexity` … max **20**（全 TS/TSX）
  - `max-lines-per-function` … max **150 行**（scripts/e2e/server/terraform は **off**）
  - `max-depth` … max **4**（scripts/e2e/server/terraform は **5**）
- **手順:** ローカルで `bun run lint 2>&1 | grep -E "complexity|max-lines-per-function|max-depth"` で警告一覧取得 → 1 ファイル・1 関数単位でリファクタ。
- **参照:** `.github/issues/phase3-complexity-readability.md`、`docs/lint-and-format.md`、`eslint.config.js`（66–70 行目、80–88 行目）。

---

## 2. 現在の違反一覧（ファイル・行・ルール別）

### 2.1 集計サマリ

| ルール                 | 件数（概算） | 主な場所                                                         |
| ---------------------- | ------------ | ---------------------------------------------------------------- |
| max-lines-per-function | 約 35        | src コンポーネント・フック・テスト、Lambda                       |
| complexity             | 約 20        | src/lib、terraform Lambda、scripts                               |
| max-depth              | 約 10        | src/lib/aiService.ts、GoogleDriveProvider、terraform aiProviders |

### 2.2 ファイル別・詳細

#### scripts（max-lines は off、max-depth 5、complexity 20）

| ファイル                               | 行     | 内容                 |
| -------------------------------------- | ------ | -------------------- |
| `scripts/sync/sync-aurora-dev-data.ts` | 1000:1 | `main` complexity 22 |

---

#### src/components

| ファイル                                                         | 行    | ルール                 | 内容                           | 対応                                                  |
| ---------------------------------------------------------------- | ----- | ---------------------- | ------------------------------ | ----------------------------------------------------- |
| `src/components/ai-chat/AIChatInput.tsx`                         | 42:8  | max-lines              | `AIChatInput` 373 行           |                                                       |
| `src/components/editor/ImageNodeView.tsx`                        | 25:55 | max-lines              | Arrow 166 行                   | ✅ ImageNodeErrorState/ImageNodeToolbar 抽出で解消    |
| `src/components/editor/MermaidGeneratorDialog.tsx`               | 31:78 | max-lines              | Arrow 193 行                   |                                                       |
| `src/components/editor/PageEditor/PageEditorContent.tsx`         | 41:68 | complexity             | Arrow complexity 29            | ✅ getCollaborationState 抽出で解消                   |
| `src/components/editor/TiptapEditor.tsx`                         | 41:51 | max-lines              | Arrow 199 行                   |                                                       |
| `src/components/editor/TiptapEditor/EditorBubbleMenu.tsx`        | 34:66 | max-lines              | Arrow 173 行                   |                                                       |
| `src/components/editor/TiptapEditor/EditorRecommendationBar.tsx` | 30:80 | max-lines              | Arrow 282 行                   |                                                       |
| `src/components/editor/TiptapEditor/useImageUploadManager.ts`    | 22:8  | max-lines              | `useImageUploadManager` 464 行 |                                                       |
| `src/components/layout/Header/HeaderSearchBar.tsx`               | 13:8  | max-lines              | `HeaderSearchBar` 204 行       |                                                       |
| `src/components/layout/ImageCreateDialog.tsx`                    | 33:68 | max-lines              | Arrow 267 行                   |                                                       |
| `src/components/page/PageCard.tsx`                               | 35:43 | max-lines              | Arrow 188 行                   |                                                       |
| `src/components/settings/AISettingsForm.tsx`                     | 57:41 | max-lines + complexity | Arrow 356 行, complexity 25    |                                                       |
| `src/components/settings/GeneralSettingsForm.tsx`                | 31:46 | max-lines              | Arrow 206 行                   | ✅ GeneralSettingsProfileCard/DisplayCards 抽出で解消 |
| `src/components/settings/StorageSettingsForm.tsx`                | 57:46 | max-lines + complexity | Arrow 293 行, complexity 46    |                                                       |

#### src/hooks

| ファイル                            | 行   | ルール     | 内容                | 対応                            |
| ----------------------------------- | ---- | ---------- | ------------------- | ------------------------------- |
| `src/hooks/useAIChat.ts`            | 15:8 | max-lines  | `useAIChat` 174 行  | -                               |
| `src/hooks/useKeyboardShortcuts.ts` | 25:5 | complexity | Arrow complexity 21 | ✅ ルックアップテーブル化で解消 |

#### src/lib（本番ロジック・要優先）

| ファイル                                                 | 行                      | ルール     | 内容                      |
| -------------------------------------------------------- | ----------------------- | ---------- | ------------------------- |
| `src/lib/aiService.ts`                                   | 264:1                   | complexity | `callAIWithServerHTTP` 34 |
| `src/lib/aiService.ts`                                   | 327,329,342,346,352,357 | max-depth  | 深度 5–6 が複数           |
| `src/lib/aiService.ts`                                   | 399:1                   | complexity | `callOpenAI` 23           |
| `src/lib/api/apiClient.ts`                               | 57:1                    | complexity | `request` 34              |
| `src/lib/api/apiClient.ts`                               | 155:1                   | complexity | `requestOptionalAuth` 28  |
| `src/lib/markdownExport.ts`                              | 31:1                    | complexity | `convertNode` 31          |
| `src/lib/pageRepository/StorageAdapterPageRepository.ts` | 52:19                   | complexity | `createPage` 21           |
| `src/lib/storage/providers/GoogleDriveProvider.ts`       | 231:13                  | max-depth  | 深度 5                    |
| `src/lib/storage/providers/S3Provider.ts`                | 39:20                   | complexity | `uploadImage` 24          |

#### src/pages

| ファイル                      | 行     | ルール                 | 内容                        | 対応                                                            |
| ----------------------------- | ------ | ---------------------- | --------------------------- | --------------------------------------------------------------- |
| `src/pages/NoteMembers.tsx`   | 31:31  | max-lines              | Arrow 179 行                | ✅ NoteMembersLoadingOrDenied/ManageSection 抽出で解消          |
| `src/pages/NotePageView.tsx`  | 14:32  | complexity             | Arrow 23                    | ✅ canEditPage 抽出・条件変数化で解消                           |
| `src/pages/NoteSettings.tsx`  | 52:32  | max-lines              | Arrow 224 行                |                                                                 |
| `src/pages/NoteView.tsx`      | 30:28  | max-lines + complexity | Arrow 228 行, complexity 29 | ✅ 分割・getNoteViewPermissions 抽出で解消                      |
| `src/pages/Notes.tsx`         | 50:25  | max-lines              | Arrow 152 行                | ✅ CreateNoteDialogContent 抽出で解消                           |
| `src/pages/Onboarding.tsx`    | 30:30  | max-lines              | Arrow 229 行                |                                                                 |
| `src/pages/Pricing.tsx`       | 118:27 | max-lines              | Arrow 172 行                | ✅ PricingAiInfo/Faq/BillingIntervalToggle/PlanCards 抽出で解消 |
| `src/pages/SearchResults.tsx` | 34:16  | max-lines              | `SearchResults` 199 行      |                                                                 |

#### src テスト（_.test.ts / _.test.tsx）

| ファイル                                                      | 行            | ルール    | 内容                 |
| ------------------------------------------------------------- | ------------- | --------- | -------------------- |
| `src/components/editor/PageEditor/useEditorAutoSave.test.ts`  | 10:31         | max-lines | Arrow 168 行         |
| `src/components/page/LinkedPagesSection.test.tsx`             | 40:32         | max-lines | Arrow 187 行         |
| `src/hooks/useGlobalSearch.test.ts`                           | 20:25         | max-lines | Arrow 180 行         |
| `src/hooks/useLinkedPages.test.ts`                            | 61:34, 524:43 | max-lines | Arrow 348 行, 165 行 |
| `src/hooks/useSyncWikiLinks.test.ts`                          | 43:31         | max-lines | Arrow 184 行         |
| `src/lib/aiService.test.ts`                                   | 57:31, 133:56 | max-lines | Arrow 478 行, 381 行 |
| `src/lib/aiSettings.test.ts`                                  | 21:32         | max-lines | Arrow 184 行         |
| `src/lib/api/apiClient.test.ts`                               | 8:23          | max-lines | Arrow 264 行         |
| `src/lib/auth/cognitoAuth.test.ts`                            | 33:25         | max-lines | Arrow 192 行         |
| `src/lib/contentUtils.test.ts`                                | 12:35         | max-lines | Arrow 319 行         |
| `src/lib/markdownExport.test.ts`                              | 4:30          | max-lines | Arrow 183 行         |
| `src/lib/pageRepository/StorageAdapterPageRepository.test.ts` | 64:42         | max-lines | Arrow 231 行         |
| `src/lib/sync/syncWithApi.test.ts`                            | 73:25         | max-lines | Arrow 216 行         |

#### terraform（max-depth 5、max-lines off）

| ファイル                                                      | 行                   | ルール     | 内容                                            |
| ------------------------------------------------------------- | -------------------- | ---------- | ----------------------------------------------- |
| `terraform/modules/ai-api/lambda/src/index.ts`                | 79:1                 | complexity | `handleHttpEvent` 28                            |
| `terraform/modules/ai-api/lambda/src/services/aiProviders.ts` | 116:8, 210:34, 242:8 | complexity | `fetchAnthropic` 21, Arrow 21, `fetchGoogle` 22 |
| `terraform/modules/api/lambda/src/routes/syncPages.ts`        | 81:29                | complexity | Async arrow 30                                  |
| `terraform/modules/api/lambda/src/routes/users.ts`            | 20:21                | complexity | Async arrow 27                                  |
| `terraform/modules/api/lambda/src/routes/webhooks/polar.ts`   | 20:15                | complexity | Async arrow 31                                  |
| `terraform/modules/api/lambda/src/services/aiProviders.ts`    | 379:13, 381:15       | max-depth  | 深度 6, 7（max 5）                              |

---

## 3. 作業の優先順位案

- **優先度 1（影響小・効果大）** ✅ 完了（2026-02-24）
  - `max-depth` のみのファイル: `aiService.ts`（327 付近）, `GoogleDriveProvider.ts`（231）, `terraform/.../api/.../aiProviders.ts`（379, 381）  
    → 早期 return / ヘルパー抽出で深度を 4（または terraform は 5）以下に。
- **優先度 2（本番ロジックの complexity）** ✅ 完了（2026-02-24）
  - `apiClient.ts`（`request`, `requestOptionalAuth`）, `aiService.ts`（`callAIWithServerHTTP`, `callOpenAI`）, `markdownExport.ts`（`convertNode`）, `StorageAdapterPageRepository.ts`（`createPage`）, `S3Provider.ts`（`uploadImage`）  
    → 分岐の抽出・ガード節・マップ化で complexity 20 以下に。
- **優先度 3（UI・フックの長大関数）** ✅ 一部完了（PR #85 マージ済み）
  - **対応済み:** `AIChatInput.tsx`, `useImageUploadManager.ts`, `HeaderSearchBar.tsx`, `SearchResults.tsx`, `useAIChat.ts` など（子コンポーネント・`useAIChatExecute`・`useImageUploadManagerHelpers` 等へ分割）。
  - **残り:** `TiptapEditor.tsx`, `EditorBubbleMenu`, `EditorRecommendationBar`, `ImageNodeView`, `MermaidGeneratorDialog`, `PageEditorContent`, `ImageCreateDialog`, `PageCard`, `AISettingsForm`, `GeneralSettingsForm`, `StorageSettingsForm`, `useKeyboardShortcuts`, 各 pages（NoteMembers, NotePageView, NoteSettings, NoteView, Notes, Onboarding, Pricing）など。
- **優先度 4（テストの長大 Arrow）**
  - 各 `*.test.ts` / `*.test.tsx` の長い `describe`/`it` コールバック  
    → テスト用ヘルパーや複数 `it` に分割（Issue の「一時的 eslint-disable」も選択肢）。
- **最後**
  - `scripts/sync/sync-aurora-dev-data.ts` の `main`（complexity 22）  
    → scripts は max-lines 対象外のため、complexity のみ対応。

---

## 4. 作業時の注意（Issue #72・phase3 ドキュメントより）

- 1 ファイル・1 関数単位で PR にすると安全。
- テストがあるファイルはリファクタ後に `bun run test:run` を実行。
- UI 変更がないか、コンポーネントは目視または E2E で確認。
- 150 行を少し超えるだけの場合は、一時的に `eslint-disable` と理由コメントも可（乱用は避ける）。
- 完了条件: `bun run lint` で該当 warn 0、`bun run test:run` と `bun run build` 成功。

---

## 5. 参照

- Issue #72: https://github.com/otomatty/zedi/issues/72
- 手順・パターン: `.github/issues/phase3-complexity-readability.md`
- ルール方針: `docs/lint-and-format.md`
- 閾値・override: `eslint.config.js`（66–70 行目、80–88 行目）
- 再取得コマンド: `bun run lint 2>&1 | grep -E "complexity|max-lines-per-function|max-depth"`

---

## 6. 実施メモ（2026-02-24）

以下の 4 件を対応し、該当 Phase 3 警告を解消した。

| ファイル                                                 | 内容                                                                                                                                               |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/hooks/useKeyboardShortcuts.ts`                      | ショートカット分岐をルックアップテーブル（match/handle 配列）に変更し complexity 21→20 以下に。                                                    |
| `src/pages/Notes.tsx`                                    | 新規ノート作成ダイアログの中身を `CreateNoteDialogContent` に切り出し、メインコンポーネントを 150 行以内に。                                       |
| `src/pages/NotePageView.tsx`                             | `canEditPage()` ヘルパーと `isLoading` / `isNotFound` 変数で分岐を整理し complexity 23→20 以下に。                                                 |
| `src/components/editor/PageEditor/PageEditorContent.tsx` | `getCollaborationState()` でコラボ状態と config を算出し、`showCollaborationLoading` / `showEditor` で JSX 分岐を簡略化。complexity 29→20 以下に。 |

確認: `bun run lint`（該当 warn 解消）、`bun run test:run`、`bun run build` はいずれも成功。

---

## 7. 実施メモ（残作業対応）

以下のファイルで Phase 3 警告を解消した。

| ファイル                                          | 内容                                                                                                                                                                                                                    |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/pages/Pricing.tsx`                           | `PricingAiInfo` / `PricingFaq` / `BillingIntervalToggle` / `PricingPlanCards` に分割し max-lines 172→150 以下に。                                                                                                       |
| `src/pages/NoteMembers.tsx`                       | `memberRoleOptions` 未定義を修正。`NoteMembersLoadingOrDenied` / `NoteMembersManageSection` に分割し max-lines 179→150 以下に。                                                                                         |
| `src/components/editor/ImageNodeView.tsx`         | `ImageNodeErrorState` / `ImageNodeToolbar` に分割し max-lines 166→150 以下に。                                                                                                                                          |
| `src/pages/NoteView.tsx`                          | `NoteViewLoadingOrDenied` / `NoteViewAddPageDialogContent` / `NoteViewPageGrid` / `NoteViewHeaderActions` / `NoteViewMainContent` / `getNoteViewPermissions` に分割し max-lines 228→150 以下・complexity 29→20 以下に。 |
| `src/components/settings/GeneralSettingsForm.tsx` | `GeneralSettingsProfileCard` / `GeneralSettingsDisplayCards` に分割し max-lines 206→150 以下に。                                                                                                                        |
