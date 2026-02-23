# 一般設定 仕様書

**作成日:** 2026-02-15  
**対象:** 設定画面に「一般設定」を追加し、テーマ・フォントサイズ・言語・プロフィール（アカウント名・サムネイル）を設定可能にする。

---

## 1. 概要

設定トップ（`/settings`）に「一般設定」を追加し、以下の 4 カテゴリを 1 つの一般設定画面（`/settings/general`）で編集できるようにする。

| カテゴリ         | 設定項目       | 説明                                                       |
| ---------------- | -------------- | ---------------------------------------------------------- |
| **表示**         | テーマ         | ライト / ダーク / システム                                 |
| **表示**         | フォントサイズ | エディタ本文の文字サイズ（標準 / やや大きめ / 大きめ）     |
| **言語**         | 言語           | UI の表示言語（日本語 / English）                          |
| **プロフィール** | アカウント名   | 画面上に表示する名前（表示名）                             |
| **プロフィール** | サムネイル     | ヘッダー等に表示するアバター画像（URL またはアップロード） |

---

## 2. 現在の実装状況（関連部分）

### 2.1 設定画面

- **設定トップ**: `src/pages/Settings.tsx` — カードで「AI 設定」「画像ストレージ設定」を表示。
- **サブページ**: `AISettings.tsx` / `StorageSettings.tsx` は共通レイアウト（戻る + タイトル + `Container` + `max-w-2xl`）。
- **UI パターン**: Card（CardHeader / CardTitle / CardDescription, CardContent, CardFooter）、Switch / Select / Input、保存時に `useToast`。

### 2.2 テーマ

- `src/components/ui/sonner.tsx` で `useTheme()`（next-themes）を参照。**ThemeProvider は未設置**。テーマ切替 UI はなし。一般設定でテーマを追加する際は ThemeProvider の設置が必要。

### 2.3 ユーザー情報・プロフィール

- **表示元**: `useUser()` は Cognito の id_token から `name` / `picture` / `cognito:username` をパースし、`fullName`・`profileImageUrl`（imageUrl）として提供（`CognitoAuthProvider.tsx`, `UserMenu.tsx`）。
- **バックエンド**: `apiClient.upsertMe({ display_name?, avatar_url? })` が存在（`POST /api/users/upsert`）。表示名・アバター URL を保存する想定。
- **取得 API**: 現状、フロントから「保存済み display_name / avatar_url を取得する」API は未確認。実装時に **GET /api/users/me**（または upsert レスポンスでユーザー情報を返す）など、プロフィール読み取り手段の用意が必要。

### 2.4 言語（i18n）

- 現状、UI は日本語固定。`date-fns` の `ja` ロケールをコード内で使用。**i18n 基盤は未導入**。言語切り替えには react-i18next 等の導入と文言のリソース化が必要。

---

## 3. 機能仕様

### 3.1 テーマ

| 項目   | 内容                                                                                                  |
| ------ | ----------------------------------------------------------------------------------------------------- |
| 設定値 | `system` \| `light` \| `dark`                                                                         |
| 表示名 | システムに従う / ライト / ダーク                                                                      |
| UI     | Select または 3 択の Segmented Control                                                                |
| 保存先 | localStorage（`zedi-general-settings` 内の `theme`）                                                  |
| 反映   | next-themes の `setTheme()` を呼び、`ThemeProvider` をルートに設置して `document` の class を切り替え |
| 初回   | 未設定時は `system`                                                                                   |

### 3.2 フォントサイズ

| 項目     | 内容                                                                                             |
| -------- | ------------------------------------------------------------------------------------------------ |
| 設定値   | `normal` \| `large` \| `x-large`（対応する px は 14 / 16 / 18 など、既存スタイルに合わせて定義） |
| 表示名   | 標準 / やや大きめ / 大きめ                                                                       |
| UI       | Select                                                                                           |
| 適用範囲 | ページエディタ（Tiptap）の本文コンテンツ領域のみ。他レイアウトは変更しない                       |
| 保存先   | localStorage（`zedi-general-settings` 内の `editorFontSize`）                                    |
| 実装     | エディタのラッパーに CSS 変数（例: `--editor-font-size`）を渡し、設定値で切り替え                |

### 3.3 言語

| 項目   | 内容                                                                                    |
| ------ | --------------------------------------------------------------------------------------- |
| 設定値 | `ja` \| `en`（第一弾はこの 2 つ）                                                       |
| 表示名 | 日本語 / English                                                                        |
| UI     | Select                                                                                  |
| 保存先 | localStorage（`zedi-general-settings` 内の `locale`）                                   |
| 反映   | i18n プロバイダの言語キーを切り替え。未設定時は `ja`（またはブラウザ言語に近い方）      |
| 前提   | react-i18next（または同等）の導入、文言のリソース化。既存の日本語文字列をキー参照に移行 |

### 3.4 プロフィール（アカウント名・サムネイル）

| 項目         | 内容                                                                                                                                                                                                          |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| アカウント名 | 画面上で表示する名前（表示名）。最大長はバックエンドの仕様に合わせる（例: 100 文字）。空の場合は Cognito の `name` または `cognito:username` をフォールバック表示                                             |
| サムネイル   | ヘッダーのユーザーメニュー等で表示するアバター画像。**URL 入力** または **画像アップロード** のいずれかで設定。空の場合は Cognito の `picture` をフォールバック表示                                           |
| 保存先       | バックエンド（`POST /api/users/upsert`）に `display_name` / `avatar_url` を送信。フロントでは「最後に保存した値」をキャッシュしてもよいが、表示は原則バックエンドまたは Cognito の組み合わせで行う            |
| 取得         | 初回表示・設定画面表示時に **GET /api/users/me**（または同等）で `display_name` / `avatar_url` を取得。未実装の場合はバックエンドに API 追加。取得できない間は Cognito の値のみ表示し、編集保存で upsert する |

**サムネイルのアップロード仕様**

- 画像ファイルを選択 → 既存の画像アップロードフロー（デフォルトストレージ or 外部ストレージの設定に従う）でアップロードし、得られた URL を `avatar_url` として `upsertMe` に渡す。
- または、画像 URL を直接入力するフィールドを用意し、その URL を `avatar_url` として保存する。両方（URL 入力 + ファイル選択）を用意してもよい。

**プロフィールの表示優先順位**

1. バックエンドに `display_name` / `avatar_url` がある場合: それを使用。
2. ない場合: Cognito の `name` / `picture` を使用。

そのため、Auth コンテキストまたは useUser のデータソースを「Cognito + バックエンドのプロフィール」に拡張する実装が必要。

---

## 4. 画面・ルーティング

| パス                | ページ                      | 内容                                                                                                                            |
| ------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `/settings`         | Settings.tsx                | 既存の「AI 設定」「画像ストレージ設定」に加え、**「一般設定」** カードを追加。タップで `/settings/general` へ遷移               |
| `/settings/general` | GeneralSettings.tsx（新規） | ヘッダー（戻る + 「一般設定」）+ 一般設定フォーム。既存の AISettings / StorageSettings と同じレイアウト（Container, max-w-2xl） |

- **一般設定フォーム**: 1 つの Card 内で「テーマ」「フォントサイズ」「言語」「プロフィール（アカウント名・サムネイル）」のセクションを並べる、またはセクションごとに Card を分けてもよい。保存は 1 つの「保存」ボタンで一括、またはテーマのみ即時反映など、仕様に合わせて調整。

---

## 5. データ構造

### 5.1 クライアント側（localStorage: テーマ・フォントサイズ・言語）

```ts
// src/types/generalSettings.ts

export type ThemeMode = "system" | "light" | "dark";

export type EditorFontSize = "normal" | "large" | "x-large";

export type UILocale = "ja" | "en";

export interface GeneralSettings {
  theme: ThemeMode;
  editorFontSize: EditorFontSize;
  locale: UILocale;
}

export const DEFAULT_GENERAL_SETTINGS: GeneralSettings = {
  theme: "system",
  editorFontSize: "normal",
  locale: "ja",
};
```

- **永続化**: `src/lib/generalSettings.ts` で `loadGeneralSettings` / `saveGeneralSettings`（キー例: `zedi-general-settings`）。
- **フック**: `useGeneralSettings()` で読み込み・更新・保存を提供（useStorageSettings / useAISettings と同様）。

### 5.2 プロフィール（バックエンド）

- **更新**: 既存の `apiClient.upsertMe({ display_name?: string; avatar_url?: string })` を使用。
- **取得**: `GET /api/users/me`（または同等）のレスポンスに `display_name`, `avatar_url` を含める形を想定。API が未実装の場合はバックエンドで追加。
- プロフィールのみ別フック `useProfile()` で「取得・更新・表示用の displayName / avatarUrl」を提供し、一般設定フォームと UserMenu の両方から参照する形が扱いやすい。

---

## 6. ファイル構成案

| 種別           | ファイル                                          | 役割                                                               |
| -------------- | ------------------------------------------------- | ------------------------------------------------------------------ |
| 型             | `src/types/generalSettings.ts`                    | ThemeMode, EditorFontSize, UILocale, GeneralSettings               |
| 永続化         | `src/lib/generalSettings.ts`                      | load / save general settings（localStorage）                       |
| フック         | `src/hooks/useGeneralSettings.ts`                 | 一般設定の読み込み・更新・保存                                     |
| フック         | `src/hooks/useProfile.ts`                         | プロフィール取得・更新（API）、表示用 displayName / avatarUrl      |
| ページ         | `src/pages/GeneralSettings.tsx`                   | 一般設定ページ（ヘッダー + フォーム）                              |
| コンポーネント | `src/components/settings/GeneralSettingsForm.tsx` | テーマ・フォントサイズ・言語・プロフィールのフォーム               |
| ルート         | `App.tsx`                                         | `/settings/general` を追加し、GeneralSettings を Protected で表示  |
| 設定トップ     | `src/pages/Settings.tsx`                          | 「一般設定」カードを追加                                           |
| テーマ         | `main.tsx` または `App.tsx`                       | ThemeProvider（next-themes）を設置                                 |
| 言語           | 新規                                              | i18n プロバイダ・リソース（例: `src/i18n/`）、既存文言のキー化     |
| 表示           | `CognitoAuthProvider` または useUser              | プロフィール取得 API の結果をマージして fullName / imageUrl を提供 |

---

## 7. 実装時の注意点

1. **テーマ**: ThemeProvider をルートに設置。一般設定でテーマを変更したら `setTheme()` を呼び、同時に `saveGeneralSettings` で localStorage に保存。アプリ初回ロード時に `loadGeneralSettings().theme` を `setTheme` に渡す。
2. **フォントサイズ**: Tiptap のコンテンツ用ラッパーにのみ CSS 変数を適用し、他レイアウトに影響させない。
3. **言語**: リソースは `ja` / `en` の JSON 等で用意。切り替え時に i18n の `changeLanguage(locale)` を呼び、`saveGeneralSettings` で `locale` を保存。初回は `loadGeneralSettings().locale` またはブラウザ言語に合わせる。
4. **プロフィール**: UserMenu 等の表示を「バックエンド優先 → Cognito フォールバック」にするため、useUser のデータソースを拡張するか、useProfile の値を優先して表示する。サムネイルのアップロードは既存の useImageUpload / ストレージ設定の流れを再利用する。
5. **GET /api/users/me**: 未実装の場合はバックエンドに「認証ユーザーの display_name, avatar_url を返す」エンドポイントを追加する必要がある。

---

## 8. まとめ

| 項目                   | 内容                                                                                   |
| ---------------------- | -------------------------------------------------------------------------------------- |
| 設定項目               | テーマ / フォントサイズ / 言語 / プロフィール（アカウント名・サムネイル）              |
| テーマ・フォント・言語 | クライアント localStorage（`zedi-general-settings`）＋ ThemeProvider / CSS 変数 / i18n |
| プロフィール           | バックエンド（upsertMe + 取得用 API）。表示はバックエンド優先、未設定時は Cognito      |
| 画面                   | 設定トップに「一般設定」カード、`/settings/general` で一画面にまとめて編集             |
| 前提                   | next-themes の ThemeProvider、i18n 基盤、プロフィール取得 API（必要に応じて新規追加）  |

この仕様に沿って実装すれば、テーマ・フォントサイズ・言語・プロフィール（アカウント名・サムネイル）を一般設定から一括で設定できる。
