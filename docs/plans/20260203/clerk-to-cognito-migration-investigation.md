# Clerk → Cognito 認証移行 実装調査

**作成日:** 2026-02-03  
**目的:** 認証を Clerk から Amazon Cognito ベースへ移行するために必要な実装の詳細調査

---

## 1. 現状サマリー（Clerk 利用箇所）

### 1.1 認証プロバイダ・エントリ

| ファイル | 役割 |
|----------|------|
| `src/main.tsx` | `ClerkProvider` でアプリをラップ。E2E 時は `MockClerkProvider`。`VITE_CLERK_PUBLISHABLE_KEY` 必須。 |
| `src/components/auth/MockClerkProvider.tsx` | E2E 用のモック。`useMockAuth` / `getToken` / `userId` / `signOut` を提供。 |

### 1.2 認証フックの抽象化

| ファイル | 役割 |
|----------|------|
| `src/hooks/useAuth.ts` | `useAuth` / `useUser` / `SignedIn` / `SignedOut` を提供。通常時は Clerk、E2E 時は Mock に委譲。 |

**重要:** アプリの多くのコンポーネントは **Clerk を直接 import していない**。`@/hooks/useAuth` と `@/components/auth/ProtectedRoute` 経由のみ。一方、以下は **Clerk 直接参照** あり。

### 1.3 Clerk を直接参照しているファイル

| ファイル | 参照内容 | 移行時の対応 |
|----------|----------|--------------|
| `src/pages/SignIn.tsx` | `SignIn as ClerkSignIn` from `@clerk/clerk-react` | Cognito 用のサインイン画面に差し替え（Hosted UI リダイレクト or カスタムフォーム） |
| `src/components/layout/Header.tsx` | `useUser`, `useClerk` from `@clerk/clerk-react`（`signOut` 用） | `useAuth` / `useUser` と Cognito の `signOut` に統一 |

### 1.4 トークン取得（getToken）の利用箇所

Clerk の `getToken(options?)` は **JWT を返す**。オプションで `template: "turso"` を指定している箇所あり（Clerk JWT テンプレート「turso」用）。Cognito 移行後は **ID Token / Access Token** で同等の役割を満たす。

| ファイル | 用途 | 備考 |
|----------|------|------|
| `src/hooks/useCollaboration.ts` | `getToken()`（引数なし） | Hocuspocus の Auth メッセージ用。Cognito では **ID Token** を渡す想定。 |
| `src/hooks/usePageQueries.ts` | `getToken({ template: "turso" })` | Turso 認証・同期用。Aurora 移行後は **Cognito ID Token** で API 認証に利用。 |
| `src/hooks/useTurso.ts` | `getToken({ template: "turso" })` | `createAuthenticatedTursoClient` に JWT を渡す。Aurora 移行まで Turso を使う場合は Cognito JWT に差し替え。 |
| `src/lib/aiService.ts` | `getClerkToken()`（内部で `getToken({ template: "turso" })`） | AI API 呼び出しの `Authorization: Bearer`。Cognito ID Token に差し替え。 |

### 1.5 Turso 認証（移行期のみ）

| ファイル | 役割 |
|----------|------|
| `src/lib/turso.ts` | `createAuthenticatedTursoClient(jwtToken)`。現状は Clerk JWT または `VITE_TURSO_AUTH_TOKEN` フォールバック。Aurora 移行後は Turso 認証は不要になるが、**移行期間中**は Cognito で発行した JWT を Turso に渡す必要があるかは Turso 側の JWT 検証設定次第（多くの場合は Aurora 切り替えと同時に廃止）。 |

### 1.6 その他

- **E2E**: `VITE_E2E_TEST=true` で `MockClerkProvider` を使用。Cognito 移行後も **同じモックインターフェース**（`useAuth` / `getToken` / `userId` / `signOut`）を維持すれば E2E はそのまま動作可能。
- **単体テスト**: `src/test/mocks.ts` で `@clerk/clerk-react` の `useAuth` をモック。Cognito 移行後は `useAuth` の実装先が変わるだけなので、**インターフェースを揃える**ことが重要。

---

## 2. Cognito 側の現状（Terraform）

- **User Pool / App Client / Domain**: 構築済み（`terraform/modules/security/main.tf`）。
- **認証フロー（現行）**:
  - `explicit_auth_flows`: `ALLOW_USER_SRP_AUTH`, `ALLOW_REFRESH_TOKEN_AUTH`
  - OAuth: `allowed_oauth_flows = ["code"]`、Hosted UI 用に `callback_urls` / `logout_urls` 設定済み（`dev.tfvars` で `http://localhost:30000/callback`, `http://localhost:30000/auth/callback` 等）。
- **注意**: `USER_PASSWORD_AUTH`（平文パスワードで InitiateAuth）は **未許可**。カスタムサインインフォームでメール/パスワードを使う場合は、Terraform で `ALLOW_USER_PASSWORD_AUTH` を追加するか、**USER_SRP_AUTH** のまま **Amplify Auth** や **amazon-cognito-identity-js** で SRP サインインする必要あり。

---

## 3. 実装オプション（サインイン方式）

### 3.1 オプション A: Cognito Hosted UI（OAuth Code フロー）

- ユーザーを Cognito の Hosted UI にリダイレクトし、サインイン後に **callback URL** へリダイレクトされる。
- **必要な実装**:
  - フロント: `/sign-in` で Cognito Hosted UI へのリンクまたはリダイレクト（`/callback` または `/auth/callback` を `callback_urls` に含める）。
  - フロント: **Callback ルート**（例: `/auth/callback`）を追加し、URL の `code` を取得 → **Token Endpoint** で code を token に交換（CORS が許可されていればフロントから直接、または BFF 経由）。
  - トークン（id_token / access_token / refresh_token）を保存し、既存の `useAuth` / `getToken` 相当を「Cognito の ID Token を返す」実装に差し替え。
- **利点**: パスワードを自前で扱わない。Cognito の画面で MFA 等も利用可能。
- **欠点**: 画面遷移が発生。デザインの統一には Cognito のカスタマイズまたは別途「カスタム UI」が必要。

### 3.2 オプション B: カスタム UI（メール/パスワード）

- 現在の `SignIn` ページのように、自前のフォームでメール・パスワードを入力させる。
- **必要な設定**:
  - Terraform: `explicit_auth_flows` に `ALLOW_USER_PASSWORD_AUTH` を追加（または `ALLOW_USER_SRP_AUTH` のまま SRP クライアントを使用）。
- **必要な実装**:
  - `docs/specs/application-implementation-plan.md` の **4.5 Cognito認証への移行** に記載の `CognitoAuthClient` と同様のクライアント（`InitiateAuth` / `GetUser` / `GlobalSignOut` / トークン保存・リフレッシュ・`getIdToken()`）を実装。
  - サインイン画面を Clerk コンポーネントから、Cognito 用のフォーム（＋必要ならサインアップ・パスワードリセット）に差し替え。
- **利点**: UX を現行のサインインに近づけやすい。
- **欠点**: パスワードを扱う責任が増える。SRP を使う場合はライブラリ（Amplify / amazon-cognito-identity-js）の利用が現実的。

### 3.3 確定方針: OAuth のみ（Google + GitHub）、カスタム UI

- **メール・パスワード認証は使用しない**。サインインは **Google** と **GitHub** の OAuth のみ。
- **カスタム UI**: サインイン画面には「Google でサインイン」「GitHub でサインイン」ボタンのみ。クリック時に Cognito の OAuth 認可 URL へリダイレクト（`identity_provider=Google` または `identity_provider=GitHub`）。認証後は Cognito が **callback URL** へ `code` を返すため、**コールバックルート** `/auth/callback` で code → token 交換が必要。
- **OAuth コールバック URL（確定）**:
  - 本番: `https://zedi-note.app/auth/callback`
  - 開発: `http://localhost:30000/auth/callback`
- **既存ユーザー（Clerk）の移行**: 今回のフェーズに含める。Clerk userId → Cognito sub のマッピングと DB の `user_id` 更新を実施する。
- **Google / GitHub**: 既に OAuth アプリは実装済みのため、同一の Client ID / Client Secret を Cognito のフェデレーション IdP として登録する。
- **Terraform**: User Pool に `aws_cognito_identity_provider` で Google / GitHub を追加。App Client の `supported_identity_providers` に `Google`, `GitHub` を追加。メール/パスワードは使わないため `USER_PASSWORD_AUTH` / `USER_SRP_AUTH` は不要（OAuth のみなら `ALLOW_REFRESH_TOKEN_AUTH` と OAuth code フローで足りる）。
- **ユーザー属性**: Google/GitHub から返る name / picture 等は Cognito の ID Token に含まれる。アプリの `useUser` では、Clerk 互換の `fullName` / `firstName` / `imageUrl` / `primaryEmailAddress.emailAddress` を Cognito の属性＋IdP クレームから組み立てる。

---

## 4. 確定仕様（2026-02-03 反映）

| 項目 | 決定内容 |
|------|----------|
| メール・パスワード認証 | 使用しない（OAuth のみ） |
| サインアップ / パスワードリセット | 不要（Google/GitHub 初回サインインで Cognito がユーザー自動作成） |
| OAuth コールバック URL | 本番: `https://zedi-note.app/auth/callback` / 開発: `http://localhost:30000/auth/callback` |
| ログアウト後の戻り先 | 本番: `https://zedi-note.app` / 開発: `http://localhost:30000` |
| 既存ユーザー（Clerk）移行 | 今回フェーズで実施（Clerk userId → Cognito sub マッピング、DB `user_id` 更新） |
| Google/GitHub OAuth | 既存の OAuth アプリを Cognito IdP に登録する |

---

## 5. 実装タスク一覧（Cognito 移行）

以下は **認証プロバイダを Clerk → Cognito に差し替える** ために必要な作業を整理したもの。カスタム UI + Google/GitHub 方針に合わせてある。

### 5.1 フロントエンド共通

| # | タスク | 詳細 |
|---|--------|------|
| 1 | **Cognito 用 Auth コンテキスト・ストア** | トークン（id_token / access_token / refresh_token）とユーザー情報（sub, email 等）を保持。localStorage 等への永続化。リフレッシュは有効期限前に実行。 |
| 2 | **useAuth / useUser の Cognito 版** | 既存の `useAuth` の戻り値（`isLoaded`, `isSignedIn`, `userId`, `getToken`, `signOut` 等）を維持しつつ、中身を Cognito の状態・`getIdToken()` に差し替え。E2E 時は従来どおり `MockClerkProvider` に委譲。 |
| 3 | **getToken の意味の統一** | 現行: Clerk の `getToken()` / `getToken({ template: "turso" })`。移行後: **Cognito の ID Token** を返す関数に統一（Turso 用テンプレートは不要。必要なら同じ ID Token をそのまま利用）。 |
| 4 | **サインイン画面の差し替え** | Clerk の `<SignIn>` を廃止し、「Google でサインイン」「GitHub でサインイン」ボタンのみのカスタム画面に。クリックで Cognito OAuth 認可 URL へリダイレクト。ルート `/auth/callback` で code 受取 → token 交換 → トークン保存。 |
| 5 | **Header の signOut** | `useClerk()` の `signOut` をやめ、Cognito のサインアウト（トークン破棄＋必要なら GlobalSignOut 呼び出し）に差し替え。`useUser` は `useAuth` 経由の Cognito ユーザーに統一。 |
| 6 | **ProtectedRoute / AuthGate** | 変更不要（`useAuth` の `isSignedIn` / `isLoaded` に依存するため、useAuth の差し替えで対応）。 |
| 7 | **AI API 用トークン** | `src/lib/aiService.ts` の `getClerkToken()` を廃止し、Cognito の ID Token を返す共通の `getAuthToken()` に差し替え。 |
| 8 | **Turso 用 JWT（移行期）** | Aurora に完全移行するまで Turso を使う場合、`createAuthenticatedTursoClient` に渡すトークンを Cognito ID Token に変更。Turso が Cognito の JWKS で検証できるかは Turso 側設定次第。できない場合は Aurora 移行までフォールバックトークン等で対応するか、Turso を読取専用にする等の検討。 |
| 9 | **環境変数** | `VITE_CLERK_PUBLISHABLE_KEY` を削除し、`VITE_COGNITO_USER_POOL_ID` / `VITE_COGNITO_CLIENT_ID` / `VITE_AWS_REGION` 等を追加。`.env.example` 更新。 |
| 10 | **main.tsx** | `ClerkProvider` を削除し、Cognito 用の **AuthProvider**（トークン管理＋useAuth 提供）でラップ。E2E 時は従来どおり `MockClerkProvider`。 |
| 11 | **パッケージ** | `@clerk/clerk-react` を削除。Cognito OAuth 用に `@aws-sdk/client-cognito-identity-provider`（token エンドポイント用）等を追加。メール/パスワード未使用のため SRP 用ライブラリは不要。 |
| 11a | **Google/GitHub サインイン** | サインイン画面に「Google でサインイン」「GitHub でサインイン」ボタンのみ。クリック時に Cognito OAuth 認可 URL（`identity_provider=Google` / `identity_provider=GitHub`）へリダイレクト。`/auth/callback` で code → token 交換し、トークンを保存。 |

### 5.2 リアルタイム（Hocuspocus）

| # | タスク | 詳細 |
|---|--------|------|
| 12 | **useCollaboration / CollaborationManager** | `getAuthToken` に渡す関数を、Clerk の `getToken()` から **Cognito の ID Token を返す関数** に変更（`useAuth` 経由で取得する形でよい）。 |
| 13 | **Hocuspocus サーバー onAuthenticate** | `server/hocuspocus/src/index.ts` の `onAuthenticate` で、受け取った `token` を **Cognito JWT** として検証（例: `aws-jwt-verify` の `CognitoJwtVerifier`）。issuer: `https://cognito-idp.{region}.amazonaws.com/{userPoolId}`、`token_use`: `id` または `access`、有効期限。検証成功時は `sub` を user.id にマッピング。ECS には既に `COGNITO_USER_POOL_ID` / `COGNITO_REGION` が渡されている。 |

### 5.3 バックエンド（API・DB）

- **Aurora 移行後**: API の認可は Cognito JWT の検証（Lambda Authorizer または API 内で `aws-jwt-verify`）で行う。現行の Turso 用 JWT 利用箇所は、Aurora＋Lambda の構成に合わせて「Cognito ID Token を Authorization ヘッダーで送り、Lambda で検証」に統一する。

### 5.4 既存ユーザー移行（Clerk → Cognito）

| # | タスク | 詳細 |
|---|--------|------|
| 18 | **移行マッピング** | 既存 Clerk ユーザーと Cognito ユーザーの対応表を作成。移行手順: 同一メールで Cognito にサインイン（Google/GitHub）させる、または事前に Cognito にユーザーを作成し `sub` を発行。Clerk `userId` → Cognito `sub` のマッピングを保持。 |
| 19 | **DB の user_id 更新** | Turso（および将来 Aurora）の `pages.user_id` / `notes.owner_user_id` 等、Clerk の `user_xxxx` を参照しているカラムを、移行後の Cognito `sub` に一括更新。マッピング表に基づいて UPDATE。 |
| 20 | **移行スクリプト・手順** | 移行を実行するスクリプトまたは手順書。ダウンタイムまたはメンテナンスウィンドウでの実施方針を記載。 |

#### メールアドレスが変わるユーザー（Google Workspace 等）について

マッピングは「**Clerk の userId**」と「**移行後に使う Cognito の `sub`**」を対応させる。  
Cognito の `sub` は、**そのユーザーが初めて Cognito にサインインしたときの Google/GitHub アカウント**に紐づく。  
以前と異なるメール（例: Google Workspace）でサインインすると別の `sub` になるため、マッピングを取るタイミングで「どちらのアカウントで紐づけるか」を決める必要がある。

**方針（現時点）:** まだ開発ユーザーのみのため、**データ移行時にメールアドレスを切り替えることで対応する**。

- 移行手順の一環で、各ユーザーに「**移行後も使う Google/GitHub アカウント**」で一度 Cognito にサインインしてもらう。
- 個人メールのまま使う場合は従来どおりそのアカウントでサインイン、Google Workspace などに切り替える場合は**移行時にそのアカウントでサインイン**する。
- その時点で取得した「Clerk userId（またはメール）↔ Cognito sub」の対応表でマッピングを作成し、DB の `user_id` を一括更新する。

これにより、移行時点で使うアカウントを選んでもらえばよく、アカウントリンク機能や事前予約は不要とする。

**参考（ユーザー増加時など）:** 手動マッピング表の事前用意・移行前サインイン予約・移行後のアカウントリンク機能などは、本番でユーザーが増えた場合の選択肢としてドキュメント化しておく。

### 5.5 Terraform・設定

| # | タスク | 詳細 |
|---|--------|------|
| 14 | **Callback URL** | 本番: `https://zedi-note.app/auth/callback`、開発: `http://localhost:30000/auth/callback` を `cognito_callback_urls` に設定。ログアウト後: 本番 `https://zedi-note.app`、開発 `http://localhost:30000` を `cognito_logout_urls` に設定。`dev.tfvars` / `prod.tfvars` で反映済み。 |
| 15a | **Google/GitHub IdP** | `aws_cognito_identity_provider` で Google と GitHub を User Pool に追加。App Client の `supported_identity_providers` に `Google`, `GitHub` を追加。既存 OAuth アプリの Client ID / Client Secret を Cognito に登録（variable または Secrets Manager）。メール/パスワード未使用のため `USER_PASSWORD_AUTH` / `USER_SRP_AUTH` は追加しない。 |

### 5.6 E2E・テスト

| # | タスク | 詳細 |
|---|--------|------|
| 16 | **E2E** | `MockClerkProvider` はそのまま利用。`useAuth` が E2E 時にモックを返すため、Cognito 実装後も E2E は変更不要でよい。 |
| 17 | **単体テスト** | Clerk をモックしている箇所（`src/test/mocks.ts`）は、`useAuth` のインターフェースが同じであれば、Cognito 実装後もモックの形を維持可能。必要に応じて「Cognito 用のモック」に差し替え。 |

---

## 6. 推奨順序

1. **Terraform**: コールバック/ログアウト URL の確定、Google/GitHub IdP の追加（`dev.tfvars` / `prod.tfvars` 反映済み）。
2. **Cognito Auth クライアント・コンテキストの実装**（OAuth code → token 交換、トークン保存・リフレッシュ・`getIdToken()`・`signOut`）。
3. **useAuth / useUser の差し替え**（Cognito 実装を注入、E2E は Mock のまま）。
4. **サインイン画面の差し替え**（「Google でサインイン」「GitHub でサインイン」ボタンのみ＋`/auth/callback` で code → token）。
5. **Header の signOut・useUser** を Cognito に統一。
6. **getToken 利用箇所の差し替え**（useCollaboration, usePageQueries, useTurso, aiService）。
7. **main.tsx** から ClerkProvider 削除、Cognito AuthProvider に差し替え。
8. **Hocuspocus の onAuthenticate** で Cognito JWT 検証を実装。
9. **既存ユーザー移行**（Clerk userId → Cognito sub マッピング、DB の `user_id` 一括更新、移行スクリプト・手順）。
10. 環境変数・`.env.example` 更新、`@clerk/clerk-react` 削除。

Turso は Aurora 移行完了まで残す場合、上記 5 の時点で Cognito ID Token を Turso に渡すか、フォールバックトークンのみにするかはポリシーに応じて選択。

---

## 7. 参照ドキュメント

| ドキュメント | パス |
|-------------|------|
| 実装計画・現状 | `docs/plans/20260123/implementation-status-and-roadmap.md` |
| Cognito 統合メモ（Hocuspocus） | `docs/work-logs/20260202/realtime-4401-unauthorized-investigation.md` |
| アプリ実装計画（CognitoAuthClient 例） | `docs/specs/application-implementation-plan.md` §4.5 |
| AWS 接続情報（Cognito ID 等） | `docs/work-logs/20260131/aws-connection-summary.md` |
| Terraform Cognito | `terraform/modules/security/main.tf` |

---

## 8. 補足: ユーザー ID の扱い

- **Clerk**: `userId` は `user_xxxx` 形式の文字列。
- **Cognito**: ユーザー一意識別子は **`sub`**（JWT の claim）。アプリ内の `userId` は `sub` に統一する。
- **DB（Aurora/Turso）**: Turso の `user_id` は現状 Clerk の userId。**今回フェーズ**で既存ユーザー移行を実施し、Clerk userId → Cognito sub のマッピングに基づいて `user_id` を一括更新する。Aurora 移行後はユーザーテーブルに `cognito_sub`（または `user_id` を Cognito sub に統一）で整合する。

以上が、Clerk から Cognito ベースへ認証を移行するための実装調査の詳細である。
