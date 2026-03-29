# Cloudflare Terraform（3 スタック構成）

dev と prod の適用タイミングを分離するため、Cloudflare リソースを **shared / dev / prod** の 3 スタックで管理する。

## ディレクトリと役割

| スタック   | ディレクトリ | Terraform Cloud Workspace | 管理リソース                                                              |
| ---------- | ------------ | ------------------------- | ------------------------------------------------------------------------- |
| **shared** | `shared/`    | `cloudflare-shared`       | ゾーン参照・api/realtime の DNS（CNAME + Railway 検証 TXT）               |
| **dev**    | `dev/`       | `cloudflare-dev`          | Pages `zedi-dev`、`dev.zedi-note.app` の DNS                              |
| **prod**   | `prod/`      | `cloudflare-prod`         | Pages `zedi`・`zedi-admin`、`zedi-note.app`・`admin.zedi-note.app` の DNS |

## 適用タイミング

- **shared**: 変更は少ない想定。PR で plan、**手動で workflow_dispatch の Apply Shared** のみ実行。
- **dev**: `develop` への push（かつ `terraform/cloudflare/dev/**` の変更）で自動 apply。PR で plan。
- **prod**: `main` への push（かつ `terraform/cloudflare/prod/**` の変更）で自動 apply。PR で plan。`deploy-prod` の Deploy Admin は apply-cloudflare-prod の後に実行される。

## Cloudflare トークンと Account ID の設定

**3 つの Workspace（shared / dev / prod）すべてで、同じ `cloudflare_api_token` と `cloudflare_account_id` を使ってよい。** 同一 Cloudflare アカウント・同一ゾーンを扱うため、1 セットを共通で設定すれば十分。

| 設定場所             | 用途                                                                                                     |
| -------------------- | -------------------------------------------------------------------------------------------------------- |
| **Terraform Cloud**  | 各 Workspace の Variables に Terraform 変数として同じ値を登録（ローカル・手動実行時）                    |
| **terraform.tfvars** | 各スタックの `terraform.tfvars.example` をコピーして `terraform.tfvars` に同じ値を記入（ローカル実行時） |
| **GitHub Secrets**   | `CLOUDFLARE_API_TOKEN` と `CLOUDFLARE_ACCOUNT_ID` を Environment に登録（CI 実行時）                     |

Terraform Cloud の Workspace 変数・トークン作成は [HashiCorp Terraform Cloud ドキュメント](https://developer.hashicorp.com/terraform/cloud-docs) を参照（リポジトリ内の長文ガイドは持たない）。

## ローカルでの実行

各スタックは独立している。Terraform Cloud に **3 つの Workspace** を作成し、上記のとおり変数を設定する（共通のトークン・Account ID でよい）。

```bash
# 例: shared の plan（変数は Terraform Cloud または terraform.tfvars で設定済みとする）
cd terraform/cloudflare/shared
terraform init
# 未設定なら環境変数で渡す:
# export TF_VAR_cloudflare_api_token="..."
# export TF_VAR_cloudflare_account_id="..."
terraform plan
```

変数は各ディレクトリの `terraform.tfvars.example` をコピーして `terraform.tfvars` に記入するか、Terraform Cloud の各 Workspace 変数で**同じ値**を設定する。

## CI での変数

GitHub Actions では次の Secrets を Environment（development / production）に設定する。

- `TF_API_TOKEN` — Terraform Cloud 認証（backend 用）
- `CLOUDFLARE_API_TOKEN` — Provider 用（`TF_VAR_cloudflare_api_token` として渡す）
- `CLOUDFLARE_ACCOUNT_ID` — Provider 用（`TF_VAR_cloudflare_account_id` として渡す）

各 workflow で上記を `TF_VAR_*` に渡しているため、plan/apply はそのまま動作する。

## 参考（外部）

- [Terraform Cloud](https://developer.hashicorp.com/terraform/cloud-docs) — Workspace・変数・実行
- [Cloudflare Provider](https://registry.terraform.io/providers/cloudflare/cloudflare/latest/docs) — DNS・ゾーン
