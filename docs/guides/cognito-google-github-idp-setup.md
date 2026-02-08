# Google / GitHub を Cognito の IdP として設定する手順

Cognito で「Google でサインイン」「GitHub でサインイン」を有効にするための設定手順です。

---

## 前提：Cognito のドメインを確認する

Terraform で Cognito をデプロイ済みの場合、次のコマンドで Hosted UI の URL を確認します。

```bash
terraform -chdir=terraform output -raw cognito_hosted_ui_url
```

例: `https://zedi-dev-590183877893.auth.ap-northeast-1.amazoncognito.com`

**IdP 用のコールバック URL** は、この URL の `https://` を除いたホストに `/oauth2/idpresponse` を付けたものです。

- 開発環境の例: `https://zedi-dev-590183877893.auth.ap-northeast-1.amazoncognito.com/oauth2/idpresponse`
- 本番環境の例: `https://<本番の Cognito ドメイン>.auth.<リージョン>.amazoncognito.com/oauth2/idpresponse`

Google と GitHub の両方で、この **同じ URL** を「リダイレクト URI / コールバック URL」として登録します。

---

## 1. Google の設定

### 1.1 Google Cloud Console で OAuth クライアントを作成

1. **Google Cloud Console** を開く  
   - https://console.cloud.google.com/

2. **プロジェクトを選択**（または新規作成）  
   - 画面上部のプロジェクト名をクリックし、Zedi 用のプロジェクトを選択。

3. **認証情報ページへ**  
   - 左メニュー: **API とサービス** → **認証情報**  
   - または https://console.cloud.google.com/apis/credentials

4. **「認証情報を作成」→「OAuth クライアント ID」** をクリック。

5. **同意画面の設定**（初回のみ）  
   - OAuth 同意画面が未設定の場合は、「同意画面を構成」を案内されるので、**外部**（または内部）を選び、アプリ名・サポートメールなどを入力して保存。

6. **アプリケーションの種類**  
   - **「ウェブアプリケーション」** を選択。

7. **名前**  
   - 例: `Zedi (Cognito IdP)` など任意の名前。

8. **承認済みのリダイレクト URI** に **1 件追加**  
   - **URI**: 上記で確認した Cognito の IdP 用 URL  
   - 例（開発）: `https://zedi-dev-590183877893.auth.ap-northeast-1.amazoncognito.com/oauth2/idpresponse`  
   - 本番用の Cognito ドメインを使う場合は、本番用の同じ形式の URL を追加。

9. **作成** をクリック。

10. **クライアント ID** と **クライアント シークレット** が表示されるので、控えておく。  
    - クライアント ID: `xxxxx.apps.googleusercontent.com` 形式  
    - クライアント シークレット: `GOCSPX-xxxxx` 形式（再表示できないので必ず保存）。

### 1.2 Terraform に渡す

- **Client ID**: `terraform/environments/dev.tfvars` の `google_oauth_client_id` に記載するか、環境変数 `TF_VAR_google_oauth_client_id` で渡す。
- **Client Secret**: セキュリティのため `.tfvars` に書かず、**環境変数** `TF_VAR_google_oauth_client_secret` で渡すことを推奨。

---

## 2. GitHub の設定

### 2.1 GitHub で OAuth アプリを作成

1. **GitHub** にログインし、**Developer settings** を開く  
   - https://github.com/settings/developers  
   - または プロフィールアイコン → **Settings** → 左メニュー最下部 **Developer settings**

2. **OAuth Apps** の **「New OAuth App」**（または「OAuth アプリを登録」）をクリック。

3. 次のように入力する。

   | 項目 | 入力例 |
   |------|--------|
   | **Application name** | `Zedi (Dev)` など |
   | **Homepage URL** | `http://localhost:30000`（開発）または本番のアプリ URL |
   | **Authorization callback URL** | Cognito の IdP 用 URL（Google と同じ）<br>例: `https://zedi-dev-590183877893.auth.ap-northeast-1.amazoncognito.com/oauth2/idpresponse` |

4. **Register application** をクリック。

5. 次の画面で **Client ID** が表示される。**「Generate a new client secret」** で Client Secret を発行し、両方を控える。  
   - Client ID: `Iv1.xxxxx` 形式  
   - Client secret: 再表示できないので必ず保存。

### 2.2 Terraform に渡す

- **Client ID**: `dev.tfvars` の `github_oauth_client_id` に記載するか、`TF_VAR_github_oauth_client_id` で渡す。
- **Client Secret**: `.tfvars` に書かず、**環境変数** `TF_VAR_github_oauth_client_secret` で渡すことを推奨。

### 2.3 GitHub IdP とプロキシ（Terraform で対応済み）

GitHub は OIDC の discovery エンドポイントを提供していないため、Cognito 用に **token / user をプロキシする API** が必要です。  
このリポジトリでは **Terraform モジュール `cognito-github-proxy`** で Lambda + API Gateway をデプロイし、次を提供しています。

- `GET /.well-known/openid-configuration` … OIDC discovery
- `POST /token` … GitHub への code → access_token 交換のプロキシ
- `GET /user` … GitHub の user API を呼び、`sub` を付与して返す

**有効にする手順**

1. `dev.tfvars`（または本番用 tfvars）で **`enable_github_idp = true`** を設定する。
2. `dev.secret.env` に **`TF_VAR_github_oauth_client_secret`** を設定する。
3. `source terraform/environments/dev.secret.env` のうえで **`terraform apply`** を実行する。

これでプロキシ API と Cognito の GitHub IdP が作成され、「GitHub でサインイン」が利用可能になります。

---

## 3. Terraform での反映

### 3.1 Client ID を dev.tfvars に書く

**ファイル**: `terraform/environments/dev.tfvars`

取得した **Client ID** をそのまま記載します。シークレットはこのファイルには書きません。

```hcl
google_oauth_client_id = "xxxxx.apps.googleusercontent.com"   # Google の Client ID
github_oauth_client_id = "Iv1.xxxxx"                           # GitHub の Client ID
```

### 3.2 シークレットを「どのファイルに」「どのように」書くか

**ファイル**: `terraform/environments/dev.secret.env`（自分で作成する。リポジトリには含めない）

**手順**:

1. **例ファイルをコピーして作成する**
   ```bash
   cp terraform/environments/dev.secret.env.example terraform/environments/dev.secret.env
   ```
   Windows の場合は、`dev.secret.env.example` をコピーし、`dev.secret.env` という名前で保存する。

2. **dev.secret.env を開き、`=` の右に実際のシークレットを書く**
   ```bash
   TF_VAR_google_oauth_client_secret=GOCSPX-あなたのGoogleのシークレット
   TF_VAR_github_oauth_client_secret=あなたのGitHubのシークレット
   ```
   - 値にスペースや特殊文字が含まれる場合は、全体をダブルクォートで囲む: `TF_VAR_google_oauth_client_secret="GOCSPX-xxx"`
   - 先頭が `#` の行はコメントとして無視される。

3. **このファイルは .gitignore に含まれており、git にコミットされません。**

### 3.3 terraform 実行前にシークレットを読み込む

**Bash / WSL / Git Bash**（プロジェクトルートで）:

```bash
source terraform/environments/dev.secret.env
terraform -chdir=terraform plan -var-file=environments/dev.tfvars
terraform -chdir=terraform apply -var-file=environments/dev.tfvars
```

**PowerShell**（プロジェクトルートで）:

```powershell
Get-Content terraform/environments/dev.secret.env | Where-Object { $_ -match '^[^#]' } | ForEach-Object {
  $name, $value = ($_ -split '=', 2).Trim()
  if ($name) { [Environment]::SetEnvironmentVariable($name, $value.Trim('"'), 'Process') }
}
terraform -chdir=terraform plan -var-file=environments/dev.tfvars
terraform -chdir=terraform apply -var-file=environments/dev.tfvars
```

**一時的にターミナルで export する場合**（ファイルに書かず 1 回だけ渡す）:

```bash
export TF_VAR_google_oauth_client_secret="GOCSPX-xxx"
export TF_VAR_github_oauth_client_secret="xxx"
terraform -chdir=terraform apply -var-file=environments/dev.tfvars
```

---

## 4. 本番環境の場合

- **Google**: 同じ Google Cloud の OAuth クライアントに、**本番の Cognito IdP 用 URL** を「承認済みのリダイレクト URI」として **追加**する（開発用と本番用で 1 クライアントに複数 URI を登録可能）。
- **GitHub**: 本番用に別の OAuth App を作るか、既存アプリの **Authorization callback URL** を本番 Cognito の IdP URL に変更（または複数登録できる場合は追加）。
- **Terraform**: `prod.tfvars` に本番用の `google_oauth_client_id` / `github_oauth_client_id` を設定し、Secret は CI/CD の環境変数や Secrets Manager から `TF_VAR_*` で渡す。

本番の Cognito IdP 用 URL の形式は開発と同じで、ホストだけ本番の Cognito ドメインに変わります。

---

## 5. 動作確認

1. アプリの `.env` に `VITE_COGNITO_DOMAIN` と `VITE_COGNITO_CLIENT_ID` が設定されていることを確認（`docs/guides/env-variables-guide.md` 参照）。
2. アプリを起動し、`/sign-in` を開く。
3. **「Google でサインイン」** または **「GitHub でサインイン」** をクリック。
4. それぞれの認証画面にリダイレクトされ、ログイン後にアプリの `/home` などに戻れば成功です。

---

## 6. よくあるトラブル

| 現象 | 確認すること |
|------|----------------|
| リダイレクト URI が無効 | Google / GitHub の「リダイレクト URI」「Authorization callback URL」が、Cognito の **IdP 用 URL**（`/oauth2/idpresponse`）と **完全一致**しているか。プロトコル・ホスト・パスの typo や余分なスラッシュに注意。 |
| Cognito で IdP が有効にならない | Terraform apply が成功しているか。`supported_identity_providers` に Google / GitHub が含まれるのは、対応する `google_oauth_client_id` / `github_oauth_client_id` が **空でない** 場合のみ。 |
| サインイン後にエラー | アプリ側のコールバック URL（`cognito_callback_urls`）に `http://localhost:30000/auth/callback`（開発）が含まれているか。Terraform の `cognito_callback_urls` と `.env` の `VITE_COGNITO_REDIRECT_URI`（未設定時は origin + `/auth/callback`）が一致しているか。 |

---

## 7. 関連ドキュメント

- IdP の説明: `docs/guides/identity-provider-idp-explained.md`
- .env の設定: `docs/guides/env-variables-guide.md`
- Terraform の変数例: `terraform/environments/dev.tfvars`
