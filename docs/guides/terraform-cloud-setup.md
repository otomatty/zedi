# Terraform Cloud の設定方法

**目的:** [terraform/cloudflare/](../../terraform/cloudflare/) の **shared / dev / prod** 各スタックの state を Terraform Cloud（HCP Terraform）で管理するための設定手順。

**前提:** Cloudflare API トークンと Account ID の取得が済んでいること（[terraform-cloudflare-prerequisites.md](terraform-cloudflare-prerequisites.md) 参照）。

---

## 1. 概要

- **remote バックエンド** で Terraform Cloud に state を保存する。
- スタックごとに **別 Workspace** を使い、適用タイミングを分離する。

| スタック | Workspace 名        | 用途               |
| -------- | ------------------- | ------------------ |
| shared   | `cloudflare-shared` | api/realtime DNS   |
| dev      | `cloudflare-dev`    | dev 用 Pages + DNS |
| prod     | `cloudflare-prod`   | 本番用 Pages + DNS |

設定の流れ:

1. Terraform Cloud に Organization を作成する（既存なら不要）
2. 上記 3 つの **CLI-driven** Workspace を作成する
3. 各 Workspace に Terraform 変数 `cloudflare_api_token`（Sensitive）と `cloudflare_account_id` を登録する
4. ローカルで `terraform login` のあと、各スタックで `terraform init` / `plan` で確認する

**CI（GitHub Actions）:**  
plan/apply では **Terraform 変数のかわりに**、GitHub Environment の Secrets を `TF_VAR_cloudflare_api_token` / `TF_VAR_cloudflare_account_id` として渡している。このため、Terraform Cloud の Workspace に変数を登録していなくても、CI からは実行できる。ローカルや手動実行時は、各スタックの `terraform.tfvars` または Terraform Cloud の変数を使う。

---

## 2. Terraform Cloud にサインアップ

1. [Terraform Cloud](https://app.terraform.io/)（HCP Terraform）にアクセス
2. **Sign up** でアカウントを作成（GitHub 連携も可能）
3. ログイン後、**Create an organization** を選択（未作成の場合）

**Organization 名:** 各スタックの `main.tf` の `backend "remote"` に書く名前（このリポジトリでは `Saedgewell`）。英小文字・数字・ハイフンのみ。

---

## 3. Workspace の作成（3 つ）

次の 3 つの Workspace を、いずれも **CLI-driven workflow** で作成する。

| Workspace 名        | 用途     |
| ------------------- | -------- |
| `cloudflare-shared` | 共通 DNS |
| `cloudflare-dev`    | dev 用   |
| `cloudflare-prod`   | 本番用   |

手順（1 つあたり）:

1. 画面上部の **New** → **Workspace**
2. **CLI-driven workflow** を選択
3. **Workspace name** に上記の名前を入力
4. **Create workspace** をクリック

作成後、各 Workspace の **Settings** → **General** で **Execution mode** が **Local** になっていることを確認する。

---

## 4. Cloudflare トークンと Account ID の設定

**重要:** `cloudflare_api_token` と `cloudflare_account_id` は、3 つの Workspace（shared / dev / prod）すべてで**同じ値を使ってよい**。同一の Cloudflare アカウント・同一ゾーンを扱うため、1 つのトークンと 1 つの Account ID を共通で設定すれば十分です。

設定できる場所は次の 3 通り。用途に応じてどれか（または組み合わせ）を使う。

| 設定場所                                | 使う場面                                                   | 備考                                                                                    |
| --------------------------------------- | ---------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| **Terraform Cloud の各 Workspace 変数** | ローカルや手動で `terraform plan` / `apply` するとき       | 3 Workspace とも同じ値を登録する                                                        |
| **各スタックの `terraform.tfvars`**     | ローカル実行時（Terraform Cloud に変数を入れたくない場合） | 各ディレクトリに `terraform.tfvars.example` をコピーして記入。git にコミットしない      |
| **GitHub Environment の Secrets**       | CI（GitHub Actions）から plan/apply するとき               | `CLOUDFLARE_API_TOKEN` と `CLOUDFLARE_ACCOUNT_ID` を設定。workflow が `TF_VAR_*` に渡す |

### 4.1 Terraform Cloud の Workspace 変数で設定する（推奨：ローカル実行する場合）

1. [Terraform Cloud](https://app.terraform.io/) にログインする
2. **cloudflare-shared** / **cloudflare-dev** / **cloudflare-prod** のそれぞれを開く
3. 左メニュー **Variables** を開く
4. **Add variable** → **Terraform variable** で次を追加する（**3 つとも同じ値**でよい）

| Key                     | Value                                                                                | Sensitive       |
| ----------------------- | ------------------------------------------------------------------------------------ | --------------- |
| `cloudflare_api_token`  | [前提条件ドキュメント](terraform-cloudflare-prerequisites.md)で取得した API トークン | ✅ チェックする |
| `cloudflare_account_id` | Cloudflare の Account ID（32 文字）                                                  | 不要            |

- Sensitive にチェックを入れた変数は再表示されない。誤った場合は削除して再登録する
- `zone_domain` などは各スタックの `variables.tf` に default があるため、必要に応じてのみ上書きする

### 4.2 ローカルで `terraform.tfvars` を使う場合

Terraform Cloud に変数を登録せず、ローカルのみで実行する場合:

1. 各スタックのディレクトリで、`terraform.tfvars.example` をコピーして `terraform.tfvars` を作成する
   - `terraform/cloudflare/shared/terraform.tfvars`
   - `terraform/cloudflare/dev/terraform.tfvars`
   - `terraform/cloudflare/prod/terraform.tfvars`
2. 各ファイルに **同じ** `cloudflare_account_id` を記入する
3. `cloudflare_api_token` は秘密情報のため、次のいずれかで渡す
   - ファイルに `cloudflare_api_token = "..."` を書く（`terraform.tfvars` は .gitignore 済みであることを確認）
   - または実行時に `export TF_VAR_cloudflare_api_token="..."` で環境変数に設定する

`terraform.tfvars` の例（shared / dev / prod で同じ値でよい）:

```hcl
# 3 スタック共通で同じ値でよい
cloudflare_account_id = "あなたの32文字のAccount ID"

# トークンは Sensitive のため、terraform.tfvars に書く場合は .gitignore されていることを確認すること
# cloudflare_api_token = "あなたのAPIトークン"
```

### 4.3 GitHub Actions（CI）で使う場合

CI から plan/apply するだけなら、**Terraform Cloud の Workspace 変数は不要**です。GitHub の Environment（development / production）に次の Secrets を登録すれば、各 workflow が `TF_VAR_cloudflare_api_token` と `TF_VAR_cloudflare_account_id` に渡します。

| Secret                  | 値                                                  | 用途                                      |
| ----------------------- | --------------------------------------------------- | ----------------------------------------- |
| `CLOUDFLARE_API_TOKEN`  | Cloudflare API トークン（4.1 と同じトークンでよい） | `TF_VAR_cloudflare_api_token` として渡す  |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare Account ID（4.1 と同じ ID でよい）       | `TF_VAR_cloudflare_account_id` として渡す |

- **development** Environment: dev スタックの plan/apply と deploy-dev で使用
- **production** Environment: shared / prod スタックの plan/apply と deploy-prod で使用

取得手順は [terraform-cloudflare-prerequisites.md](terraform-cloudflare-prerequisites.md) および [environment-secrets-variables-setup.md](environment-secrets-variables-setup.md) を参照する。

---

## 5. ローカル設定と backend の一致

各スタックの `main.tf` には、次のように backend が書かれている。

```hcl
backend "remote" {
  organization = "Saedgewell"
  workspaces {
    name = "cloudflare-shared"   # または cloudflare-dev / cloudflare-prod
  }
}
```

Organization 名や Workspace 名を Terraform Cloud で別にした場合は、各スタックの `shared/main.tf`・`dev/main.tf`・`prod/main.tf` を同じに編集する。

編集後、各スタックで:

```bash
cd terraform/cloudflare/shared   # または dev / prod
terraform init
```

初回は「Migrate existing state?」が出た場合、**新規の場合は No**、既にローカルに `terraform.tfstate` がある場合は Migrate するか選択する。

---

## 6. ローカルでの認証（terraform login）

Terraform Cloud に state を送るには、CLI が認証している必要がある。

1. ターミナルで `terraform login` を実行
2. 表示された URL をブラウザで開く
3. Terraform Cloud で **Token** を発行し、ターミナルに貼り付ける

**GitHub Actions で使う場合:**

- 同じトークンを GitHub の **production**（および **development**）Environment secret **TF_API_TOKEN** に登録する
- 各 workflow で `TF_TOKEN_app_terraform_io=${{ secrets.TF_API_TOKEN }}` を渡している
- Cloudflare 用の値は `TF_VAR_cloudflare_api_token` / `TF_VAR_cloudflare_account_id` として、GitHub Secrets の `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` を渡している

---

## 7. 動作確認

```bash
cd terraform/cloudflare/shared
terraform init
terraform plan
```

同様に `dev` / `prod` でも `terraform init` と `terraform plan` を実行し、エラーがなければ Terraform Cloud の **Runs** に run が表示される。既存リソースを管理する場合は [terraform-cloudflare-import.md](terraform-cloudflare-import.md) の手順で import する。

---

## 8. 参考リンク

| 項目                | URL                                                                       |
| ------------------- | ------------------------------------------------------------------------- |
| Terraform Cloud     | https://app.terraform.io/                                                 |
| CLI-driven workflow | https://developer.hashicorp.com/terraform/cloud-docs/workspaces/run/cli   |
| Workspace variables | https://developer.hashicorp.com/terraform/cloud-docs/workspaces/variables |

---

## 9. まとめ

| ステップ | 作業内容                                                                                                         |
| -------- | ---------------------------------------------------------------------------------------------------------------- |
| 1        | Terraform Cloud で Organization を作成（未作成の場合）                                                           |
| 2        | CLI-driven の Workspace を 3 つ作成: `cloudflare-shared`, `cloudflare-dev`, `cloudflare-prod`                    |
| 3        | 各 Workspace の Variables で Terraform 変数 `cloudflare_api_token`（Sensitive）と `cloudflare_account_id` を登録 |
| 4        | 各スタックの `main.tf` の `organization` / `workspaces.name` を上記と一致させる                                  |
| 5        | `terraform login` のあと、各スタックで `terraform init` と `terraform plan` で確認                               |

CI では GitHub Environment の `TF_API_TOKEN`・`CLOUDFLARE_API_TOKEN`・`CLOUDFLARE_ACCOUNT_ID` を設定すれば、workflow から plan/apply が実行できる。
