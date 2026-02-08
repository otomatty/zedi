# 作業ログ: Cognito Google/GitHub ログイン不具合の修正

**作業日:** 2026-02-08  
**対象:** Terraform + Cognito による Google/GitHub 認証の実装中に発生したログイン不可・エラー表示の解消

---

## 1. サマリー

| # | 事象 | 原因 | 対応 |
|---|------|------|------|
| 1 | `/oauth2/token` が 400 を返しログインできない | 原因特定のため詳細ログが必要 | トークン交換失敗時に `redirect_uri` とレスポンス body をコンソール出力 |
| 2 | Google アカウント選択後に `/sign-in` に戻る | コールバック後 `/home` へ遷移した初回レンダーで CognitoAuthProvider の state が `null` のままになり、ProtectedRoute が未ログインと判断 | state の初期値を `getStoredState()` で設定（lazy initializer） |
| 3 | トークン交換で `invalid_grant` (400) | React Strict Mode で useEffect が二重実行され、同じ認可コードで 2 回トークン交換。2 回目はコード使用済みで失敗 | モジュール直下の Set で「交換済み code」を管理し 1 回だけ交換。成功時は `cancelled` を見ずに setTokens/リダイレクト |
| 4 | GitHub で「missing code, client_id, or client_secret」 | プロキシ Lambda が body を正しく解釈していない、または Lambda 環境変数未設定 | body の base64 デコード対応。client_id/client_secret は環境変数フォールバック。エラーメッセージを分離 |
| 5 | GitHub で「attributes required: [email]」 | Cognito は email 必須だが、GitHub の `/user` はメール非公開時は `email` を返さない | プロキシの `/user` で `user.email` が無い場合に `GET /user/emails` を呼び、primary/verified のメールを返す |

---

## 2. 変更したファイル

### 2.1 フロントエンド（認証フロー）

| ファイル | 変更内容 |
|----------|----------|
| `src/lib/auth/cognitoAuth.ts` | トークン交換失敗時に `console.error` で `redirect_uri` とレスポンス body を出力 |
| `src/components/auth/CognitoAuthProvider.tsx` | `useState(null)` → `useState(() => getInitialAuthState())` で初回から localStorage の認証状態を反映 |
| `src/pages/AuthCallback.tsx` | 同一 code の二重トークン交換を防止（`exchangedCodes` Set）。成功時は常に setTokens + `window.location.assign("/home")` を実行 |

### 2.2 Cognito GitHub プロキシ（Lambda）

| ファイル | 変更内容 |
|----------|----------|
| `terraform/modules/cognito-github-proxy/lambda/index.mjs` | **POST /token:** `event.isBase64Encoded` 時は body を base64 デコード。client_id/client_secret は body より環境変数を優先。エラーを「missing code」と「missing client credentials」で分離。<br>**GET /user:** `user.email` が無い場合に `GET https://api.github.com/user/emails` を呼び、primary かつ verified、または verified、または先頭のメールを `email` として返す |

---

## 3. 技術メモ

### 3.1 React Strict Mode と認可コード

- 開発環境では Strict Mode により useEffect が 2 回実行される（マウント → アンマウント → 再マウント）。
- 認可コードは **1 回しか使用できない** ため、2 回目の `exchangeCodeForTokens(code)` で Cognito が `invalid_grant` を返す。
- 対策: モジュール直下の `Set` で「すでに交換に使った code」を保持し、2 回目の effect ではトークン交換をスキップ。1 回目の成功時は `cancelled` を参照せず必ず setTokens とリダイレクトを行う。

### 3.2 Cognito と GitHub の email

- Cognito User Pool のスキーマで `email` が `required = true` のため、IdP から email が渡らないと「attributes required: [email]」となる。
- GitHub の `GET /user` は、ユーザーがメールを非公開にしていると `email: null` を返す。
- GitHub の `GET /user/emails`（スコープ `user:email`）を使うと、primary/verified なメールを取得できる。プロキシの `/user` でこれをフォールバックとして呼ぶようにした。

### 3.3 デプロイ

- GitHub プロキシの修正反映は `terraform apply`（または `-target=module.cognito_github_proxy`）で Lambda が更新される。
- シークレットは `terraform/environments/dev.secret.env` に `TF_VAR_github_oauth_client_secret` 等を設定し、apply 前に `source` すること。

---

## 4. 関連ドキュメント

| ドキュメント | パス |
|-------------|------|
| Cognito / Google / GitHub IdP 設定ガイド | docs/guides/cognito-google-github-idp-setup.md |
| 環境変数ガイド | docs/guides/env-variables-guide.md |
| Clerk → Cognito 移行調査 | docs/plans/20260203/clerk-to-cognito-migration-investigation.md |
| AWS Phase 2 Security（Cognito 基盤） | docs/work-logs/20260131/aws-infrastructure-phase2-security.md |
