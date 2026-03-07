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

**Organization 名:** 各スタックの `main.tf` の `backend "remote"` に書く名前（このリポジトリでは `Saedgewell`）。英数字・ハイフン・アンダースコアが使用可能。

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

Terraform のコードは **Terraform 変数** `cloudflare_api_token` と `cloudflare_account_id` を参照しています。次のいずれかの方法で設定します。

#### 方法 A: Terraform 変数（推奨）

1. [Terraform Cloud](https://app.terraform.io/) にログインする
2. **cloudflare-shared** / **cloudflare-dev** / **cloudflare-prod** のいずれかの Workspace を開く
3. 左メニュー **Variables** を開く
4. **Workspace variables** で **+ Add variable** → **Terraform variable** を選び、次を追加する（**3 Workspace とも同じ値**でよい）

| Key                     | Value                                                                                | Sensitive       |
| ----------------------- | ------------------------------------------------------------------------------------ | --------------- |
| `cloudflare_api_token`  | [前提条件ドキュメント](terraform-cloudflare-prerequisites.md)で取得した API トークン | ✅ チェックする |
| `cloudflare_account_id` | Cloudflare の Account ID（32 文字）                                                  | 不要            |

- Sensitive にチェックを入れた変数は再表示されない。誤った場合は削除して再登録する
- `zone_domain` などは各スタックの `variables.tf` に default があるため、必要に応じてのみ上書きする

#### 方法 B: Variable Set（組織で共通利用する場合）

複数 Workspace で同じ Cloudflare 認証情報を使う場合は **Variable sets** が便利です。

1. **Variables** 画面の **Variable sets** で既存のセット（例: 「cloudflare variable」）を編集するか、**Create variable set** で新規作成する
2. 次の **Terraform 変数**（Category: **Terraform variable**）を追加する

| Key                     | Value                                                                                | Category           | Sensitive       |
| ----------------------- | ------------------------------------------------------------------------------------ | ------------------ | --------------- |
| `cloudflare_api_token`  | [前提条件ドキュメント](terraform-cloudflare-prerequisites.md)で取得した API トークン | Terraform variable | ✅ チェックする |
| `cloudflare_account_id` | Cloudflare の Account ID（32 文字）                                                  | Terraform variable | 不要            |

3. Variable set を **cloudflare-shared / cloudflare-dev / cloudflare-prod** の各 Workspace に紐付ける（Add to workspace またはプロジェクト経由で関連付ける）

**注意:** Category が **env** の `CLOUDFLARE_API_TOKEN` や `CLOUDFLARE_ACCOUNT_ID` は、Terraform の `var.cloudflare_api_token` / `var.cloudflare_account_id` には**自動では入りません**。Terraform が環境変数から変数を受け取るには、キー名を **`TF_VAR_cloudflare_api_token`** と **`TF_VAR_cloudflare_account_id`**（Category: env）にする必要があります。このリポジトリのコードは Terraform 変数を参照しているため、**Terraform 変数**で `cloudflare_api_token` と `cloudflare_account_id` を設定する方法（上記の表）を推奨します。

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

- Terraform Cloud の **User settings** → **Tokens** で API トークンを発行し、GitHub の Environment secret **TF_API_TOKEN** に登録する（詳細は [environment-secrets-variables-setup.md §2.4](environment-secrets-variables-setup.md#24-tf_api_token) 参照）
- 各 workflow で `TF_TOKEN_app_terraform_io=${{ secrets.TF_API_TOKEN }}` を渡している
- Cloudflare 用の値は `TF_VAR_cloudflare_api_token` / `TF_VAR_cloudflare_account_id` として、GitHub Secrets の `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` を渡している

**Environment とトークンの対応:** **production** Environment には 1 つの **TF_API_TOKEN** を登録すればよく、**shared** と **prod** の両方の workflow がそれを使います。Terraform Cloud の 1 つのユーザートークンで、同一 Organization 内の全 Workspace（cloudflare-shared / cloudflare-dev / cloudflare-prod）にアクセスできるためです。**development** Environment には dev 用に同じトークン（または別トークン）を登録します。

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

---

## 10. 設定完了後の次の作業

Terraform Cloud と GitHub Actions の設定が終わったあと、状況に応じて次のいずれか（または両方）を行う。

### 10.1 リソースをまだ作っていない場合（新規）

Cloudflare に DNS や Pages をまだ作っていない場合は、**apply** で作成する。

| スタック   | やり方                                                                                                                |
| ---------- | --------------------------------------------------------------------------------------------------------------------- |
| **shared** | ローカルで `terraform apply`、または GitHub Actions の「Run workflow」で `terraform-cloudflare-shared.yml` を手動実行 |
| **dev**    | `develop` に push（`terraform/cloudflare/dev/**` を変更）すると自動 apply。または手動 Run workflow                    |
| **prod**   | `main` に push（`terraform/cloudflare/prod/**` を変更）すると自動 apply。または手動 Run workflow                      |

ローカルで apply する例:

```bash
cd terraform/cloudflare/shared
terraform apply   # 確認して yes
```

### 10.2 すでに Cloudflare にリソースがある場合（既存の取り込み）

DNS レコードや Pages をすでに手動で作っている場合は、**import** で Terraform の state に取り込む。取り込まないと、次回の `terraform apply` で「新規作成」として重複や競合する。

- 手順: [terraform-cloudflare-import.md](terraform-cloudflare-import.md) に従い、各スタックで `terraform import` を実行する。
- import 後、`terraform plan` で「No changes」になることを確認する。

### 10.3 日々の運用の流れ

| やりたいこと         | 手順                                                                                                                |
| -------------------- | ------------------------------------------------------------------------------------------------------------------- |
| **shared の変更**    | PR で plan 確認 → マージ後、GitHub Actions の「Run workflow」で `Terraform Cloudflare (Shared)` を手動実行（apply） |
| **dev の変更**       | PR で plan 確認 → `develop` にマージすると **自動で apply**                                                         |
| **prod の変更**      | PR で plan 確認 → `main` にマージすると **自動で apply**                                                            |
| **アプリのデプロイ** | 通常の `deploy-dev` / `deploy-prod` workflow が、必要に応じて Cloudflare 用の `terraform apply` も実行する          |

Terraform の変更は **PR で plan を必ず確認**し、問題なければマージする運用にすると安全です。
