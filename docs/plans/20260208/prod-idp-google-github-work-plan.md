# 本番環境 GCP（Google）・GitHub 認証 作業計画

**作成日:** 2026-02-08  
**対象:** 本番 Cognito に Google / GitHub を IdP として追加し、「Google でサインイン」「GitHub でサインイン」を有効にする

**前提:**
- 本番 Terraform は `prod` workspace でデプロイ済み（Cognito User Pool 作成済み）
- 本番 Cognito ドメイン: `zedi-prod-590183877893.auth.ap-northeast-1.amazoncognito.com`
- 本番アプリ URL: `https://zedi-note.app`

---

## 1. 作業の流れ（概要）

```
[1] 本番用 IdP のリダイレクト URI を確認
    ↓
[2] GCP で本番用 OAuth クライアントを作成
    ↓
[3] GitHub で本番用 OAuth アプリを作成
    ↓
[4] prod.tfvars に Client ID を追記
    ↓
[5] prod.secret.env を作成しシークレットを設定
    ↓
[6] Terraform apply（prod workspace）で IdP と GitHub プロキシを反映
    ↓
[7] 動作確認
```

---

## 2. 本番 IdP 用のリダイレクト URI（共通）

Google と GitHub の両方で、次の **1 件** を「承認済みリダイレクト URI」または「Authorization callback URL」として登録します。

```
https://zedi-prod-590183877893.auth.ap-northeast-1.amazoncognito.com/oauth2/idpresponse
```

- プロトコル・ホスト・パスを **完全一致** で登録すること（余分なスラッシュや typo に注意）。

---

## 3. GCP（Google Cloud Platform）での作業

### 3.1 作業一覧

| # | タスク | 内容 | 成果物・確認 |
|---|--------|------|--------------|
| G1 | プロジェクトの選択 | Google Cloud Console で本番用プロジェクトを選択（開発用と同一でも、別でも可）。 | プロジェクト ID を把握 |
| G2 | OAuth 同意画面の確認 | 「API とサービス」→「OAuth 同意画面」で、外部公開または内部の設定が済んでいること。未設定ならアプリ名・サポートメール等を入力。 | 同意画面が有効 |
| G3 | OAuth クライアントの作成 | 「認証情報」→「認証情報を作成」→「OAuth クライアント ID」。アプリケーションの種類は **ウェブアプリケーション**。 | クライアント作成 |
| G4 | リダイレクト URI の登録 | 「承認済みのリダイレクト URI」に上記 §2 の URL を **1 件** 追加。開発用と本番用で **別クライアント** にする場合は、本番用のみこの URI。同一クライアントで複数 URI を登録する運用でも可。 | URI 1 件登録済み |
| G5 | Client ID・Secret の取得 | 作成後に表示される **クライアント ID**（`xxxxx.apps.googleusercontent.com`）と **クライアント シークレット**（`GOCSPX-xxxxx`）を控える。シークレットは再表示できないため、必ず安全な場所に保存。 | Client ID, Client Secret |

### 3.2 画面のたどり方（参照）

1. https://console.cloud.google.com/ にアクセス
2. 画面上部のプロジェクト選択 → Zedi 用（または本番用）プロジェクトを選択
3. 左メニュー: **API とサービス** → **認証情報**
4. **＋ 認証情報を作成** → **OAuth クライアント ID**
5. 同意画面未設定の場合は先に同意画面を構成
6. アプリケーションの種類: **ウェブアプリケーション**
7. 名前: 例）`Zedi Production (Cognito IdP)`
8. 承認済みのリダイレクト URI: §2 の URL を追加
9. **作成** → 表示された Client ID と Client Secret を保存

### 3.3 注意

- **開発用と本番用は別クライアントに分けることを推奨**（本番のシークレットを開発で使わない）。
- Client Secret は **リポジトリや .tfvars に書かず**、`prod.secret.env` または環境変数 `TF_VAR_google_oauth_client_secret` でのみ渡す。

---

## 4. GitHub での作業

### 4.1 作業一覧

| # | タスク | 内容 | 成果物・確認 |
|---|--------|------|--------------|
| H1 | OAuth アプリの作成 | GitHub → Settings → Developer settings → OAuth Apps → **New OAuth App**。 | アプリ作成 |
| H2 | 項目入力 | Application name: 例）`Zedi Production`。Homepage URL: `https://zedi-note.app`。**Authorization callback URL** に §2 の URL を登録。 | 本番用コールバック URL 登録済み |
| H3 | Client ID・Secret の取得 | **Register application** 後、表示される **Client ID** を控える。**Generate a new client secret** で Client Secret を発行し、両方を保存（Secret は再表示不可）。 | Client ID, Client Secret |

### 4.2 画面のたどり方（参照）

1. https://github.com/settings/developers にアクセス
2. **OAuth Apps** → **New OAuth App**
3. 入力例:
   - **Application name:** `Zedi Production`
   - **Homepage URL:** `https://zedi-note.app`
   - **Authorization callback URL:** `https://zedi-prod-590183877893.auth.ap-northeast-1.amazoncognito.com/oauth2/idpresponse`
4. **Register application**
5. 表示された **Client ID** をコピー
6. **Generate a new client secret** をクリックし、表示された **Client secret** をコピー（一度しか表示されない）

### 4.3 注意

- GitHub は OIDC discovery を提供しないため、**Cognito GitHub プロキシ**（Lambda + API Gateway）が Terraform で本番にもデプロイされる。`enable_github_idp = true` にするとプロキシが作成され、Cognito の GitHub IdP がその URL を参照する。
- Client Secret は **.tfvars に書かず**、`TF_VAR_github_oauth_client_secret` で渡す。

---

## 5. Terraform 側の作業

### 5.1 prod.tfvars に追記する項目

**ファイル:** `terraform/environments/prod.tfvars`

以下のブロックを追加する（既存の `# Security (Cognito)` の直後など、適切な位置に追加）。

```hcl
# Federated IdP (本番) - Client ID のみ。シークレットは prod.secret.env で渡す
google_oauth_client_id  = "ここにGCPの本番用クライアントID"
github_oauth_client_id  = "ここにGitHubの本番用Client ID"
enable_github_idp       = true
```

- `google_oauth_client_id`: GCP で取得した本番用 OAuth クライアント ID（`xxxxx.apps.googleusercontent.com`）
- `github_oauth_client_id`: GitHub で取得した本番用 OAuth アプリの Client ID
- `enable_github_idp`: GitHub サインインを有効にするため **必ず `true`**

### 5.2 prod.secret.env の作成

**ファイル:** `terraform/environments/prod.secret.env`（新規作成。**.gitignore に含める**）

**手順:**

1. `terraform/environments/dev.secret.env.example` をコピーし、`prod.secret.env` として保存する。
2. 次のように **値** を記入する（シークレットは実際の値に置き換える）。

```bash
# 本番用 IdP シークレット（Terraform apply 前に source または export で読み込む）
TF_VAR_google_oauth_client_secret=GOCSPX-本番用のGoogleのシークレット
TF_VAR_github_oauth_client_secret=本番用のGitHubのClient_Secret
```

- 値にスペースや特殊文字が含まれる場合は、全体をダブルクォートで囲む: `TF_VAR_google_oauth_client_secret="GOCSPX-xxx"`
- このファイルは **リポジトリにコミットしない**。`.gitignore` に `*.secret.env` または `prod.secret.env` が含まれていることを確認する。

### 5.3 .gitignore の確認

次のいずれかで prod.secret.env が除外されていることを確認する。

- `terraform/environments/*.secret.env`
- または `**/prod.secret.env`

未設定なら追記する。

### 5.4 Terraform apply の実行

**重要:** 本番は **prod workspace** で管理しているため、必ず `terraform workspace select prod` を実行してから apply する。

**Bash / WSL / Git Bash（プロジェクトルートで）:**

```bash
source terraform/environments/prod.secret.env
cd terraform
terraform workspace select prod
terraform plan -var-file=environments/prod.tfvars
terraform apply -var-file=environments/prod.tfvars
```

**PowerShell（プロジェクトルートで）:**

```powershell
Get-Content terraform/environments/prod.secret.env | Where-Object { $_ -match '^[^#]' } | ForEach-Object {
  $name, $value = ($_ -split '=', 2).Trim()
  if ($name) { [Environment]::SetEnvironmentVariable($name, $value.Trim('"'), 'Process') }
}
cd terraform
terraform workspace select prod
terraform plan -var-file=environments/prod.tfvars
terraform apply -var-file=environments/prod.tfvars
```

**apply で行われること:**

- **Google IdP:** Cognito User Pool に Google が IdP として追加され、`supported_identity_providers` に Google が含まれる。
- **GitHub IdP:** `cognito-github-proxy` モジュールが有効になり、本番用の Lambda + API Gateway（token / user プロキシ）が作成される。Cognito に GitHub が IdP として追加される。
- 既存の本番リソース（VPC, Cognito, ECS 等）は変更されるが、Cognito の設定とプロキシの追加のみ。

---

## 6. 動作確認

| # | 確認項目 | 手順 |
|---|----------|------|
| 1 | 本番アプリの環境変数 | デプロイ先の `VITE_COGNITO_DOMAIN` が `zedi-prod-590183877893.auth.ap-northeast-1.amazoncognito.com`、`VITE_COGNITO_CLIENT_ID` が本番のクライアント ID であることを確認。 |
| 2 | Google サインイン | https://zedi-note.app/sign-in を開き、「Google でサインイン」をクリック。Google の認証画面 → 許可後、アプリの `/home` 等に戻ること。 |
| 3 | GitHub サインイン | 同様に「GitHub でサインイン」をクリック。GitHub の認証画面 → 許可後、アプリに戻ること。 |
| 4 | コールバック URL | エラーになる場合は、Cognito の「許可されているコールバック URL」に `https://zedi-note.app/auth/callback` が含まれているか確認（prod.tfvars で設定済みの想定）。 |

---

## 7. チェックリスト（実施時用）

- [ ] **GCP** 本番用 OAuth クライアント作成済み
- [ ] **GCP** 承認済みリダイレクト URI に §2 の URL を 1 件登録済み
- [ ] **GCP** Client ID と Client Secret を取得・保存済み
- [ ] **GitHub** 本番用 OAuth アプリ作成済み
- [ ] **GitHub** Authorization callback URL に §2 の URL を登録済み
- [ ] **GitHub** Client ID と Client Secret を取得・保存済み
- [ ] **prod.tfvars** に `google_oauth_client_id` / `github_oauth_client_id` / `enable_github_idp = true` を追記済み
- [ ] **prod.secret.env** を作成し、`TF_VAR_google_oauth_client_secret` / `TF_VAR_github_oauth_client_secret` を設定済み
- [ ] **.gitignore** で prod.secret.env が除外されていることを確認済み
- [ ] **Terraform** `workspace select prod` のうえで `plan` → `apply` を実行済み
- [ ] **動作確認** 本番 URL で Google / GitHub サインインが成功することを確認済み

---

## 8. 参照ドキュメント

| ドキュメント | パス | 用途 |
|-------------|------|------|
| Cognito IdP 設定ガイド | `docs/guides/cognito-google-github-idp-setup.md` | Google / GitHub の画面手順の詳細 |
| 環境変数ガイド | `docs/guides/env-variables-guide.md` | 本番アプリの VITE_* 環境変数 |
| Phase C 作業内容 | `docs/plans/20260208/phase-c-work-breakdown.md` | C1 本番デプロイの流れ |

---

## 9. トラブルシューティング

| 現象 | 確認すること |
|------|----------------|
| リダイレクト URI が無効 | Google / GitHub の登録 URL が §2 と **完全一致**（`https://`、ホスト、`/oauth2/idpresponse`）か。 |
| Terraform で IdP が作成されない | `google_oauth_client_id` / `github_oauth_client_id` が空でないか。シークレットは apply 前に `TF_VAR_*` で渡しているか。 |
| GitHub で「missing code」等 | 本番用 Cognito GitHub プロキシ（Lambda）がデプロイされているか。`enable_github_idp = true` で apply 済みか。 |
| サインイン後にエラー | `cognito_callback_urls` に `https://zedi-note.app/auth/callback` が含まれているか。アプリの `VITE_COGNITO_REDIRECT_URI` が同じか。 |
