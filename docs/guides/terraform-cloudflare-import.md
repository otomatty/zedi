# Cloudflare Terraform: 既存リソースの import 手順

**対象:** [terraform/cloudflare/](../../terraform/cloudflare/) の **shared / dev / prod** 各スタックで、既に Cloudflare に存在するリソースを Terraform state に取り込む手順。

---

## 一括 import スクリプト（推奨）

**terraform/cloudflare/scripts/import-existing.sh** で、DNS レコード ID の取得と 3 スタック分の import を一括実行できる。

```bash
# 事前に Cloudflare のトークンと Account ID を環境変数に設定
export CLOUDFLARE_API_TOKEN="あなたのAPIトークン"
export CLOUDFLARE_ACCOUNT_ID="あなたのAccount ID（32文字）"

# terraform/cloudflare ディレクトリから実行
cd terraform/cloudflare
bash scripts/import-existing.sh
```

実行後、各スタックで `terraform plan` を実行し、差分がなければ import 完了。手動で import する場合は以下を参照。

---

## 前提

- Terraform Cloud に 3 つの Workspace（`cloudflare-shared` / `cloudflare-dev` / `cloudflare-prod`）を作成済み
- 各 Workspace に Terraform 変数または CI で `TF_VAR_cloudflare_api_token`・`TF_VAR_cloudflare_account_id` を設定済み
- ローカルで `terraform login` 済み、または CI で `TF_TOKEN_app_terraform_io` を設定済み

---

## 1. ゾーン ID と DNS レコード ID の取得

```bash
export CLOUDFLARE_API_TOKEN="your-token"

# ゾーン一覧から zedi-note.app の ID を取得
curl -s -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  "https://api.cloudflare.com/client/v4/zones?name=zedi-note.app" | jq '.result[0].id'
# 例: "abc123..."

ZONE_ID="<上記で取得した zone_id>"

# DNS レコード一覧（id, name, type を確認）
curl -s -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records" | jq '.result[] | {id, name, type}'
```

各レコードの `id` をメモする（import で使用）。

---

## 2. shared スタックの import

**shared** は api/realtime の CNAME と Railway 検証用 TXT のみ管理する。

```bash
cd terraform/cloudflare/shared
terraform init
export TF_VAR_cloudflare_api_token="your-token"
export TF_VAR_cloudflare_account_id="your-account-id"

# 形式: terraform import 'cloudflare_record.<resource_label>' <zone_id>/<record_id>
terraform import 'cloudflare_record.api_cname' "$ZONE_ID/<api の CNAME レコード ID>"
terraform import 'cloudflare_record.api_railway_verify' "$ZONE_ID/<_railway-verify.api の TXT レコード ID>"
terraform import 'cloudflare_record.realtime_cname' "$ZONE_ID/<realtime の CNAME レコード ID>"
terraform import 'cloudflare_record.realtime_railway_verify' "$ZONE_ID/<_railway-verify.realtime の TXT レコード ID>"

terraform plan
```

差分がなければ OK。

---

## 3. dev スタックの import

**dev** は Pages プロジェクト `zedi-dev` と `dev.zedi-note.app` の CNAME を管理する。

```bash
cd terraform/cloudflare/dev
terraform init
export TF_VAR_cloudflare_api_token="your-token"
export TF_VAR_cloudflare_account_id="your-account-id"

# Pages プロジェクト
terraform import 'cloudflare_pages_project.zedi_dev' "<ACCOUNT_ID>/zedi-dev"

# カスタムドメイン（形式は Cloudflare Provider の cloudflare_pages_domain ドキュメントを確認。未作成の場合は import 不要で apply で作成される）
# terraform import 'cloudflare_pages_domain.zedi_dev' "<ACCOUNT_ID>/zedi-dev/dev.zedi-note.app"

# DNS: dev.zedi-note.app の CNAME
terraform import 'cloudflare_record.pages_dev_cname' "$ZONE_ID/<dev の CNAME レコード ID>"

terraform plan
```

（Cloudflare Provider の `cloudflare_pages_domain` の import 形式は [ドキュメント](https://registry.terraform.io/providers/cloudflare/cloudflare/latest/docs/resources/pages_domain) を確認すること。上記は `account_id/project_name/domain` の例。）

---

## 4. prod スタックの import

**prod** は Pages プロジェクト `zedi`・`zedi-admin` と、apex・admin の DNS を管理する。

```bash
cd terraform/cloudflare/prod
terraform init
export TF_VAR_cloudflare_api_token="your-token"
export TF_VAR_cloudflare_account_id="your-account-id"

# Pages プロジェクト
terraform import 'cloudflare_pages_project.zedi' "<ACCOUNT_ID>/zedi"
terraform import 'cloudflare_pages_project.zedi_admin' "<ACCOUNT_ID>/zedi-admin"

# カスタムドメイン（形式は Provider ドキュメントを確認。未作成の場合は import 不要）
# terraform import 'cloudflare_pages_domain.zedi_prod' "<ACCOUNT_ID>/zedi/zedi-note.app"
# terraform import 'cloudflare_pages_domain.zedi_admin' "<ACCOUNT_ID>/zedi-admin/admin.zedi-note.app"

# DNS: @ (apex) と admin の CNAME
terraform import 'cloudflare_record.pages_prod_cname' "$ZONE_ID/<@ の CNAME レコード ID>"
terraform import 'cloudflare_record.pages_admin_cname' "$ZONE_ID/<admin の CNAME レコード ID>"

terraform plan
```

`cloudflare_pages_domain` は既存ドメインがある場合のみ import する。ID 形式は [Cloudflare Provider: cloudflare_pages_domain](https://registry.terraform.io/providers/cloudflare/cloudflare/latest/docs/resources/pages_domain) を参照する。

---

## 5. 確認

各スタックで `terraform plan` を実行し、差分がなければ既存リソースが正しく state に取り込まれている。以降は `terraform apply` で変更を加えると、Terraform の定義が Cloudflare に反映される。

---

## 参考

- [Terraform import](https://developer.hashicorp.com/terraform/cli/import)
- [Cloudflare Provider: cloudflare_record](https://registry.terraform.io/providers/cloudflare/cloudflare/latest/docs/resources/record)
- [Cloudflare Provider: cloudflare_pages_project](https://registry.terraform.io/providers/cloudflare/cloudflare/latest/docs/resources/pages_project)
- [Cloudflare Provider: cloudflare_pages_domain](https://registry.terraform.io/providers/cloudflare/cloudflare/latest/docs/resources/pages_domain)
