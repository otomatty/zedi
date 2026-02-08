# Cognito 認証のトラブルシューティング

本番（zedi-note.app）での Google / GitHub サインインまわりのよくある事象と対処です。

---

## A. 「Login option is not available」と 401 が出る（Hosted UI で Google/GitHub が選べない）

**症状:** ログインボタンで Cognito Hosted UI に飛ぶと、メール/パスワードのみ表示され、Google や GitHub を選ぶと `errorMessage=Login+option+is+not+available.+Please+try+another+one` で 401 になる。

**原因:** Terraform の apply 時に **Google / GitHub の Client Secret** が渡っておらず、Cognito のアプリクライアントで IdP が有効になっていない。

- `supported_identity_providers` に Google / GitHub を入れる条件は「Client ID と Client Secret の両方が空でない」こと。
- Secret は `.tfvars` に書かず `prod.secret.env` で渡す想定。apply の前に **source** していないと IdP が追加されない。

**対処:**

1. **prod.secret.env の中身を確認**
   - 次の 2 つが設定されているか確認する（値は伏せてよい）。
     - `TF_VAR_google_oauth_client_secret=GOCSPX-...`（GCP の OAuth クライアントの「クライアント シークレット」）
     - `TF_VAR_github_oauth_client_secret=...`（GitHub OAuth アプリの Client secret）
   - 無ければ GCP / GitHub の画面からシークレットを再発行し、`terraform/environments/prod.secret.env` に上記の変数名で追記する。

2. **apply の直前に secret を読み込んでから実行**
   - **Bash / Git Bash:** 環境変数を子プロセス（terraform）に渡すため、`set -a` で export してから読み込む。
   ```bash
   cd terraform
   terraform workspace select prod
   set -a && . environments/prod.secret.env && set +a
   terraform apply -var-file=environments/prod.tfvars
   ```
   - 一行で実行する場合: `set -a && . environments/prod.secret.env && set +a && terraform apply -var-file=environments/prod.tfvars`
   - 単に `source` しただけでは、シェルによっては terraform に変数が渡らず、plan に IdP の変更が出ないことがある。
   apply 後、Cognito の「アプリの統合」→ 当該クライアントで「Google」「GitHub」が有効になっているはず。

3. **再度 Hosted UI でログイン**
   - サインイン画面で Google / GitHub の選択肢が表示され、選択しても 401 にならないか確認する。

---

## B. Google のアカウント選択が表示されずコールバックで止まる

本番（zedi-note.app）で「Google でサインイン」を押したあと、Google のアカウント選択画面が出ずに `/auth/callback` で止まるときの確認ポイントです。

---

## 1. 最も多い原因: GCP の「承認済みリダイレクト URI」の誤り

Google が受け付けるのは **Cognito の URL** です。**アプリの URL ではありません。**

### 登録すべき URI（1 件だけ）

```
https://zedi-prod-590183877893.auth.ap-northeast-1.amazoncognito.com/oauth2/idpresponse
```

- **誤り例:** `https://zedi-note.app/auth/callback` を GCP にだけ登録している  
  → Cognito は Google に「認証後は上記 Cognito の URL に戻して」と渡すため、Google は「その URL は未登録」とみなしてエラーにし、アカウント選択画面が出ないことがあります。
- **正しい:** 上記の **Cognito の** `/oauth2/idpresponse` を GCP の「承認済みのリダイレクト URI」に追加する。

### GCP での確認手順

1. [Google Cloud Console](https://console.cloud.google.com/) → 対象プロジェクト
2. **API とサービス** → **認証情報**
3. 本番用の **OAuth 2.0 クライアント ID**（ウェブアプリケーション）を開く
4. **承認済みのリダイレクト URI** に、上記の Cognito の URL が **完全一致** で 1 件あるか確認（余分なスラッシュや typo がないか）

詳細は `docs/plans/20260208/prod-idp-google-github-work-plan.md` の「2. 本番 IdP 用のリダイレクト URI」「3. GCP での作業」を参照。

---

## 2. www で開いている場合（Cognito のコールバック URL）

`https://www.zedi-note.app` で開いている場合、アプリは `https://www.zedi-note.app/auth/callback` を Cognito に渡します。Cognito の「許可されたコールバック URL」にこの URL が無いと、Cognito がエラーにすることがあります。

- **対応:** Terraform の `prod.tfvars` で `cognito_callback_urls` に `https://www.zedi-note.app/auth/callback` を追加し、`terraform apply` する（本リポジトリでは追加済み）。
- 反映後、`https://www.zedi-note.app` から再度サインインを試す。

---

## 3. コールバック URL にエラーが出ている場合

`/auth/callback?error=...&error_description=...` のようにクエリが付いている場合、画面に `error_description` が表示されます。

| 例（error / error_description） | 想定原因 |
|----------------------------------|----------|
| `redirect_uri_mismatch` など     | GCP のリダイレクト URI が上記 §1 と一致していない |
| `access_denied`                 | ユーザーが同意画面で「キャンセル」した |
| `invalid_grant`                  | コードの二重使用や有効期限切れ。再度サインインからやり直す |

---

## 4. コードが無くエラーも無い場合

`/auth/callback` に `code` も `error` も付かずに開いている場合（ブックマークや直接アクセスなど）は、「No authorization code received」と表示されます。  
「Google でサインイン」から流れてきたのにこの表示なら、途中でクエリが落ちている可能性があります（例: フロントのルーティングや CDN で `?code=...` が捨てられていないか確認）。

---

## 5. チェックリスト

- [ ] **「Login option is not available」対策:** `prod.secret.env` に `TF_VAR_google_oauth_client_secret` と `TF_VAR_github_oauth_client_secret` を設定し、`terraform apply` の前に `source environments/prod.secret.env` している（§A 参照）
- [ ] GCP の本番用 OAuth クライアントに **Cognito の** `https://zedi-prod-590183877893.auth.ap-northeast-1.amazoncognito.com/oauth2/idpresponse` が 1 件ある
- [ ] Cognito のコールバック URL に `https://zedi-note.app/auth/callback` と（www を使う場合）`https://www.zedi-note.app/auth/callback` がある
- [ ] ブラウザでシークレットウィンドウ／別アカウントで試す（キャッシュの影響を除く）
- [ ] 本番ビルドに本番の Cognito Client ID / Domain が入っている（GitHub Secrets の VITE_COGNITO_* または .env.production）

---

## 6. 参照

- 本番 IdP 作業計画: `docs/plans/20260208/prod-idp-google-github-work-plan.md`
- 環境変数: `docs/guides/env-variables-guide.md`
