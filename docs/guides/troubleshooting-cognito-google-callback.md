# Cognito 認証のトラブルシューティング

本番（zedi-note.app）および開発環境での Google / GitHub サインインまわりのよくある事象と対処です。

---

## 0. 開発環境で `redirect_mismatch`（Cognito のエラーページが表示される）

**症状:** ログインしようとすると Cognito のエラーページが表示される。

```
GET https://zedi-dev-....auth.ap-northeast-1.amazoncognito.com/error?error=redirect_mismatch&client_id=... 400 (Bad Request)
```

**原因:** アプリが Cognito に送っている **redirect_uri**（例: `http://localhost:30000/auth/callback`）が、Cognito の「許可されたコールバック URL」に含まれていない。開発でポートを 30000 にしている場合、Cognito 側にも同じ URL が登録されている必要がある。

**対処:**

1. **Terraform で Cognito を正しい URL で再適用する**
   - `terraform/variables.tf` のデフォルトは `http://localhost:30000/auth/callback`。`environments/dev.tfvars` でも `cognito_callback_urls = ["http://localhost:30000/auth/callback"]` になっているか確認する。
   - 以下で plan を確認してから apply する（dev の場合）:
   ```bash
   cd terraform
   terraform plan -var-file=environments/dev.tfvars
   terraform apply -var-file=environments/dev.tfvars
   ```
   - apply 後、AWS コンソールの Cognito → ユーザープール → アプリの統合 → 当該クライアントで「許可されているコールバック URL」に `http://localhost:30000/auth/callback` が含まれているか確認する。

2. **開いている URL を確認する**
   - アプリは `window.location.origin + "/auth/callback"` を redirect_uri として送る。`http://127.0.0.1:30000` で開いていると、Cognito には `http://127.0.0.1:30000/auth/callback` が送られ、`localhost` だけ登録していると一致しない。
   - **対応:** ブラウザでは **`http://localhost:30000`** で開く。または `dev.tfvars` の `cognito_callback_urls` に `http://127.0.0.1:30000/auth/callback` を追加してから `terraform apply` する。

3. **環境変数で明示する（任意）**
   - `.env` に `VITE_COGNITO_REDIRECT_URI=http://localhost:30000/auth/callback` を設定すると、常にこの URL が使われる。Cognito の許可リストと一致しているか確認する。

---

## A. 「Login option is not available」と 401 が出る（Hosted UI で Google/GitHub が選べない）

**症状:** ログインボタンで Cognito Hosted UI に飛ぶと、メール/パスワードのみ表示され、Google や GitHub を選ぶと `errorMessage=Login+option+is+not+available.+Please+try+another+one` で 401 になる。

**原因:** Terraform の apply 時に **Google / GitHub の Client Secret** が渡っておらず、Cognito のアプリクライアントで IdP が有効になっていない。

- `supported_identity_providers` に Google / GitHub を入れる条件は「Client ID と Client Secret の両方が空でない」こと。
- Secret は `.tfvars` に書かず `prod.secret.env` で渡す想定。apply の前に **source** していないと IdP が追加されない。

**対処:**

1. **secret ファイルの中身を確認**
   - **本番:** `terraform/environments/prod.secret.env`
   - **開発:** `terraform/environments/dev.secret.env`（`dev.secret.env.example` をコピーして作成。このファイルは .gitignore 済み）
   - 次の 2 つが設定されているか確認する（値は伏せてよい）。
     - `TF_VAR_google_oauth_client_secret=GOCSPX-...`（GCP の OAuth クライアントの「クライアント シークレット」）
     - `TF_VAR_github_oauth_client_secret=...`（GitHub OAuth アプリの Client secret）
   - 無ければ GCP / GitHub の画面からシークレットを取得し、上記の変数名で追記する。

2. **apply の直前に secret を読み込んでから実行**
   - **Bash / Git Bash:** 環境変数を子プロセス（terraform）に渡すため、`set -a` で export してから読み込む。
   - **本番の例:**
   ```bash
   cd terraform
   set -a && . environments/prod.secret.env && set +a
   terraform apply -var-file=environments/prod.tfvars
   ```
   - **開発の例:**
   ```bash
   cd terraform
   set -a && . environments/dev.secret.env && set +a
   terraform apply -var-file=environments/dev.tfvars
   ```
   - 単に `source` しただけでは、シェルによっては terraform に変数が渡らず、plan に IdP の変更が出ないことがある。
   apply 後、Cognito の「アプリの統合」→ 当該クライアントで「Google」「GitHub」が有効になっているはず。

3. **開発で Google を使う場合:** GCP の「承認済みのリダイレクト URI」に **開発用 Cognito** の URL を 1 件追加する（本番と別クライアントなら別途追加）。例: `https://zedi-dev-590183877893.auth.ap-northeast-1.amazoncognito.com/oauth2/idpresponse`

4. **再度 Hosted UI でログイン**
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
