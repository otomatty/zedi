# 初期設定ウィザード：表示名の自動入力と必須化 仕様

## 1. 目的

- 認証（Google / GitHub）後に表示される初期設定ウィザードの Step 1（プロフィール）で、**表示名**を IdP のアカウント名で自動入力する。
- 表示名を**空欄不可**とし、未入力のまま「次へ」を押せないようにする。

---

## 2. 現在の実装状況

### 2.1 認証まわり（名前の取得元）

| 箇所                                          | 内容                                                                                                                                                                      |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/auth/cognitoAuth.ts`                 | `parseIdToken()` で ID トークンから `name`, `cognito:username`, `picture`, `email` を取得。                                                                               |
| `src/components/auth/CognitoAuthProvider.tsx` | `userFromToken()` で `fullName = parsed?.name ?? parsed?.["cognito:username"] ?? ""` を算出。Google/GitHub の表示名は `user.fullName` または `user.username` で利用可能。 |

→ **Google/GitHub のアカウント名は既に `useUser().user.fullName` / `user.username` で取得可能。**

### 2.2 プロフィール（useProfile）

| 箇所                      | 内容                                                                                           |
| ------------------------- | ---------------------------------------------------------------------------------------------- | --- | ------------------------------------------------------------------------------ |
| `src/hooks/useProfile.ts` | 編集用の `profile.displayName` は API `upsertMe` のレスポンスで初期化。未設定時は空文字 `""`。 |
| 同上                      | **表示用**の `displayName` は `profile.displayName                                             |     | user?.fullName ?? user?.username ?? ""` で算出（Cognito フォールバックあり）。 |

→ **フォームの入力値は `profile.displayName` のみ参照しているため、バックエンドが空で返すと入力欄は空のまま。**

### 2.3 ウィザード（Onboarding）

| 箇所                                    | 内容                                                                              |
| --------------------------------------- | --------------------------------------------------------------------------------- |
| `src/pages/Onboarding.tsx`              | Step 1 で `<Input value={profile.displayName} onChange={…} />` を使用。           |
| 同上                                    | 「次へ」は `isProfileSaving` のときのみ disabled。**表示名が空でも次へ進める。**  |
| `docs/onboarding-wizard-ux-proposal.md` | Step 1 の説明は「表示名とプロフィール画像を設定します（**任意**）」となっている。 |

→ **現状は表示名が空でも次へ進め、かつ IdP 名の自動入力はされない。**

---

## 3. 仕様案

### 3.1 表示名の自動入力

- **タイミング**: プロフィール取得後（`useProfile` の fetch 完了後）、バックエンドの `display_name` が空の場合に限り、Cognito ユーザー情報で表示名を補う。
- **補う値**: `user.fullName` または `user.username`（従来の `displayName` 算出と同じ優先順位）。
- **反映先**: 編集用 state `profile.displayName` にセットする。これによりウィザードの入力欄にそのまま表示される。
- **挙動**:
  - 初回サインイン時: API が空 → IdP 名で `profile.displayName` を初期化 → フォームに自動入力。
  - 既にバックエンドに表示名がある場合: そのまま使用し、上書きしない。

**実装方針**: `useProfile.ts` の `useEffect` 内で、`upsertMe` の結果を `fetched` に詰める際に、`display_name` が空なら `user?.fullName ?? user?.username ?? ""` を `displayName` に使う。`user` は `useUser()` で取得し、effect の依存に含める。

### 3.2 表示名の必須化（空欄不許可）

- **Step 1 の「次へ」**: 表示名が空（トリム後）のときは押せない（disabled）。
- **エラー表示**: 表示名が空のときに、入力欄の下などに短いメッセージを表示する（例:「表示名を入力してください」）。文言は i18n で用意。
- **プロフィール説明文**: 「任意」ではなく必須であることが分かるよう、説明文を修正する（例:「表示名を設定します。プロフィール画像は任意です。」）。

**実装方針**:

- `Onboarding.tsx` で `const displayNameInvalid = profile.displayName.trim() === ""` を定義。
- Step 1 の「次へ」の `disabled` に `displayNameInvalid || isProfileSaving` を指定。
- 表示名入力欄の下に、`displayNameInvalid` のときだけ表示するエラーメッセージを追加。
- `onboarding.profile.description` および必要なら `generalSettings.profile.displayNameHelp` の文言を、必須であることが分かるように更新。

### 3.3 保存時の扱い

- 既存の `save` では `display_name: profile.displayName || undefined` を送っている。必須化後は Step 1 で空では進めないため、送信時点では常に `profile.displayName` に値が入っている想定。
- バックエンドの必須チェックがある場合は、既存の API 仕様に合わせる。フロントでは「次へ」を押す前に必ず入力されているようにする。

---

## 4. 変更ファイル一覧（案）

| ファイル                                           | 変更内容                                                                                                         |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `src/hooks/useProfile.ts`                          | プロフィール取得後、`display_name` が空なら `user.fullName ?? user.username` で `profile.displayName` を初期化。 |
| `src/pages/Onboarding.tsx`                         | Step 1 で表示名の空チェック、次へボタンの disabled、エラーメッセージ表示を追加。                                 |
| `src/i18n/locales/ja/onboarding.json`              | `profile.description` を必須を明示する文言に変更。表示名必須用のエラーキーを追加。                               |
| `src/i18n/locales/en/onboarding.json`              | 同上（英語）。                                                                                                   |
| （任意）`src/i18n/locales/ja/generalSettings.json` | `displayNameHelp` を「空欄の場合は…」から「サインイン時の名前が初期値として入ります」などに変更可能。            |

---

## 5. エッジケース

- **IdP に名前がない場合**（`fullName` も `username` も空）: 自動入力は行われず、入力欄は空。この場合は「次へ」が disabled のままとなり、ユーザーが手動で何か入力する必要がある。
- **既存ユーザーがウィザードを完了済みで、表示名を削除して保存した場合**: 現状の API が空を許容するなら、設定画面など別経路の話として扱う。今回の対象は「初期設定ウィザードの Step 1」に限定する。

---

## 6. まとめ

- **自動入力**: `useProfile` で API の `display_name` が空のとき、`useUser().user` の `fullName` / `username` で `profile.displayName` を初期化する。
- **空欄不許可**: Onboarding の Step 1 で表示名をトリムして空なら「次へ」を無効にし、エラーメッセージを表示する。
- 上記により、Google/GitHub サインイン直後のウィザードでは表示名が自動で入り、空のまま進めない仕様にできる。

この仕様に沿って実装すれば、ご要望の「GoogleやGithubのアカウント名がそのまま自動入力」「空欄は許可しない」を満たせます。

---

## 7. 実装メモ（TDD 実施済み）

- **useProfile.test.ts**: API が空のときに `user.fullName` / `user.username` で `profile.displayName` を初期化するテストを先行で追加し、`useProfile.ts` の fetch 内で同ロジックを実装してグリーン化。
- **Onboarding.test.tsx**: Step 1 で表示名が空・空白のみのとき「次へ」を無効化し、エラーメッセージを表示するテストを先行で追加し、`Onboarding.tsx` に `displayNameInvalid` とボタン disabled・エラー表示を実装してグリーン化。
- 既存の `aiSettings.test.ts` の失敗は本実装とは無関係（modelId / isAIConfigured の既存仕様差）。
