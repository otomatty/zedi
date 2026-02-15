# 画像ストレージ優先設定（デフォルト / 外部）作業ログ

**作業日:** 2026-02-15  
**対象:** 設定画面で「デフォルトストレージ」と「外部ストレージ」をトグルで切り替え可能にする機能

---

## 1. 作業サマリー

| 項目 | 内容 |
|------|------|
| 機能概要 | 画像の保存先を「デフォルトストレージ」または「外部ストレージ」で優先選択できるトグルを設定画面に追加。UI 上は「S3」表記を使わず「デフォルトストレージ」のみ表示。 |
| 新規ファイル | 0 件 |
| 変更ファイル | 12 件 |
| ビルド | 成功 |
| 既存テスト | ストレージ変更に起因する失敗なし（他要因の失敗は既存のまま） |

---

## 2. 仕様メモ

- **トグル:** デフォルトストレージ ⇔ 外部ストレージの 2 択。初期状態はデフォルトストレージ。
- **外部ストレージ選択時:** 既存と同様に Select で Gyazo / Cloudflare R2 / GitHub / Google Drive のいずれかを選択し、各プロバイダー用の設定を表示。
- **マイグレーション:** 既存ユーザーの移行は考慮しない。読み込み時に `preferDefaultStorage` が無い場合は `true`、外部優先かつ `provider === "s3"` の場合は `provider` を `"gyazo"` に正規化。
- **表示文言:** 「S3」「Zedi (S3)」は使わず「デフォルトストレージ」に統一。

---

## 3. 変更ファイル一覧

| ファイルパス | 変更内容の概要 |
|--------------|----------------|
| `src/types/storage.ts` | `preferDefaultStorage` 追加、s3 表示名を「デフォルトストレージ」に、`EXTERNAL_STORAGE_PROVIDERS` 追加 |
| `src/lib/storage/index.ts` | `getSettingsForUpload` / `isStorageConfiguredForUpload` 追加、エラーメッセージの文言変更 |
| `src/lib/storage/providers/S3Provider.ts` | `name` およびユーザー向けメッセージを「デフォルトストレージ」に変更 |
| `src/lib/storageSettings.ts` | 読み込み時の正規化（preferDefaultStorage / provider）、`isConfigured` の算出、`isStorageConfigured()` の実装変更 |
| `src/hooks/useStorageSettings.ts` | トグルで外部に切り替えたときの provider リセット、保存時の `isConfigured` 算出、接続テストで実効設定を使用 |
| `src/hooks/useImageUpload.ts` | `getSettingsForUpload` / `isStorageConfiguredForUpload` を利用するように変更 |
| `src/components/settings/StorageSettingsForm.tsx` | トグル UI 追加、外部時のみ Select（EXTERNAL_STORAGE_PROVIDERS）、説明文・Alert 文言変更 |
| `src/components/editor/TiptapEditor.tsx` | 実効プロバイダーと `isStorageConfiguredForUpload` でストレージ状態を算出 |
| `src/components/editor/PageEditorView.tsx` | 上記と同様 |
| `src/components/editor/TiptapEditor/useImageUploadManager.ts` | アップロード・storageProviderId に `getSettingsForUpload(storageSettings)` を使用 |
| `src/components/editor/TiptapEditor/useStorageActions.ts` | 削除時のプロバイダー取得・比較に実効設定を使用 |

---

## 4. 変更内容の詳細

### 4.1 `src/types/storage.ts`

- **StorageSettings:** `preferDefaultStorage?: boolean` を追加。`true` = デフォルトストレージに保存、`false` = 外部ストレージに保存。
- **DEFAULT_STORAGE_SETTINGS:** `preferDefaultStorage: true` を追加。
- **STORAGE_PROVIDERS（s3 エントリ）:** `name: "Zedi (S3)"` → `"デフォルトストレージ"`、`description` を「ログインで利用可能」に変更。
- **EXTERNAL_STORAGE_PROVIDERS:** `STORAGE_PROVIDERS` から `id !== "s3"` のものを抽出した定数（設定画面の Select で使用）。

### 4.2 `src/lib/storage/index.ts`

- **getSettingsForUpload(settings):** アップロード時に使う実効設定を返す。`preferDefaultStorage !== false` のときは `{ provider: "s3", config: {}, isConfigured: true }` を返し、それ以外は `settings` をそのまま返す。
- **isStorageConfiguredForUpload(settings):** アップロード可能かどうか。デフォルト優先のときは `true`、外部のときは `provider !== "s3"` かつ `isProviderConfigured(provider, config)`。
- **getStorageProvider のエラー文言:** 「Zedi (S3)」→「デフォルトストレージ」に変更。

### 4.3 `src/lib/storage/providers/S3Provider.ts`

- **readonly name:** `"Zedi (S3)"` → `"デフォルトストレージ"`。
- **uploadImage / testConnection 内のメッセージ:** 「Zedi (S3)」および「S3」のユーザー向け表記を「デフォルトストレージ」に統一。

### 4.4 `src/lib/storageSettings.ts`

- **loadStorageSettings():**
  - `preferDefaultStorage`: 未設定の場合は `true` に正規化。
  - 外部優先かつ `provider === "s3"` のときは `provider` を `"gyazo"` に正規化。
  - 返却する `isConfigured` を `isStorageConfiguredForUpload(...)` の結果で設定。
- **isStorageConfigured():** 読み込んだ設定に対して `isStorageConfiguredForUpload(settings)` を返すように変更。
- **import:** `isStorageConfiguredForUpload` を `@/lib/storage` から追加。

### 4.5 `src/hooks/useStorageSettings.ts`

- **updateSettings:** `preferDefaultStorage === false` に更新され、かつ現在 `provider === "s3"` のとき、`provider` を `"gyazo"` にし、`config` を空にして `isConfigured: false` とする。
- **save():** 保存する `isConfigured` を `isProviderConfigured(...)` ではなく `isStorageConfiguredForUpload(settings)` で算出。
- **test():** 接続テストに使う設定を、デフォルト優先のときは `{ provider: "s3", config: {} }`、それ以外は現在の `settings` とする。
- **import:** `isStorageConfiguredForUpload` を追加。

### 4.6 `src/components/settings/StorageSettingsForm.tsx`

- **トグル（Switch）:** 「画像の保存先」ラベルで、OFF = デフォルトストレージ、ON = 外部ストレージ。`checked={useExternalStorage}`（`settings.preferDefaultStorage === false`）、`onCheckedChange` で `updateSettings({ preferDefaultStorage: !checked })`。
- **デフォルトストレージ時:** Select を非表示。Alert「デフォルトストレージについて」で「ログインしていれば追加の設定は不要です。画像はデフォルトストレージに保存されます。」を表示。
- **外部ストレージ時:** 「使用する外部ストレージ」の Select を表示。選択肢は `EXTERNAL_STORAGE_PROVIDERS` のみ（s3 は含めない）。既存と同様に Gyazo / R2 / GitHub / Google Drive の各設定ブロックを表示（`useExternalStorage && settings.provider === "gyazo"` 等で条件分岐）。
- **カード説明文:** 「デフォルトでは画像はデフォルトストレージに保存されます。トグルで外部ストレージに切り替え、Gyazo や Cloudflare R2 などに保存することもできます。」に変更。
- **import:** `Switch`、`EXTERNAL_STORAGE_PROVIDERS`（`STORAGE_PROVIDERS` の代わり）を追加。

### 4.7 `src/hooks/useImageUpload.ts`

- **isConfigured:** `settings.isConfigured` の代わりに `isStorageConfiguredForUpload(settings)` を使用。
- **uploadImage 内:** 未設定チェックに `isStorageConfiguredForUpload(settings)`、プロバイダー取得に `getStorageProvider(getSettingsForUpload(settings), { getToken })` を使用。
- **import:** `getSettingsForUpload`、`isStorageConfiguredForUpload` を追加。

### 4.8 `src/components/editor/TiptapEditor.tsx` / `PageEditorView.tsx`

- **isStorageConfigured:** `storageSettings.isConfigured` の代わりに `isStorageConfiguredForUpload(storageSettings)` を使用。
- **currentStorageProvider:** `getStorageProviderById(storageSettings.provider)` の代わりに、`effectiveProvider = getSettingsForUpload(storageSettings).provider` を算出し、`getStorageProviderById(effectiveProvider)` を渡す。
- **import:** `isStorageConfiguredForUpload`、`getSettingsForUpload` を `@/lib/storage` から追加。

### 4.9 `src/components/editor/TiptapEditor/useImageUploadManager.ts`

- **startUpload:** `getStorageProvider(storageSettings, ...)` を `getStorageProvider(getSettingsForUpload(storageSettings), ...)` に変更。アップロード成功時の `storageProviderId` および `replaceUploadNodeWithImage` に渡す `storageProviderId` を `uploadSettings.provider` に変更。
- **import:** `getSettingsForUpload` を追加。

### 4.10 `src/components/editor/TiptapEditor/useStorageActions.ts`

- **effectiveProvider:** `getSettingsForUpload(storageSettings).provider` を算出し、`getProviderLabel` の比較・`canDeleteFromStorage` の比較・`handleDeleteFromStorage` の比較および `getStorageProvider(getSettingsForUpload(storageSettings))` で使用。
- **import:** `getSettingsForUpload` を追加。

---

## 5. データフロー

- **保存:** ユーザーがトグルと（外部時は）Select で設定し「保存」→ `saveStorageSettings(settings)`。`isConfigured` は `isStorageConfiguredForUpload(settings)` の結果を保存。
- **読み込み:** `loadStorageSettings()` で正規化済みの `StorageSettings` を返す。`preferDefaultStorage` 未設定は `true`、外部かつ provider が s3 のときは provider を gyazo に変更。
- **アップロード:** `useImageUpload` や `useImageUploadManager` は `getSettingsForUpload(settings)` で得た設定で `getStorageProvider(...)` を呼び、そのプロバイダーでアップロード。画像ノードの `storageProviderId` には実効プロバイダー ID を保存。
- **表示:** エディタヘッダー等では `getSettingsForUpload(storageSettings).provider` から `getStorageProviderById(effectiveProvider)` で表示名を取得（s3 のときは「デフォルトストレージ」）。

---

## 6. 補足

- サムネイル API 経由で挿入する画像（`handleInsertThumbnail` 内の `storageProviderId: "s3"`）は、API がデフォルトストレージにコミットするためそのまま「s3」を指定している。
- `isStorageConfigured()`（async）は `loadStorageSettings` の結果に `isStorageConfiguredForUpload` を適用する形に変更済み。呼び出し元で同関数のみに依存している場合は、新仕様でそのまま利用可能。
