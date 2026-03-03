# Cloudflare Terraform: 既存リソースの import 手順

**対象:** [terraform/cloudflare/](../../terraform/cloudflare/) で Cloudflare DNS と Pages を IaC 管理する際、既にダッシュボードに存在するリソースを Terraform state に取り込む手順。

---

## 前提

- Terraform Cloud の workspace を作成済み（CLI-driven workflow）
- Workspace に `CLOUDFLARE_API_TOKEN`（Sensitive）と `CLOUDFLARE_ACCOUNT_ID` を Environment Variable で設定済み
- ローカルで `terraform login` 済み、または CI で `TF_TOKEN_*` を設定済み

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

各レコードの `id` をメモする（`api` CNAME, `_railway-verify.api` TXT, `realtime` CNAME, `_railway-verify.realtime` TXT）。

---

## 2. DNS レコードの import

`terraform/cloudflare/` に移動して実行。

```bash
cd terraform/cloudflare

# 形式: terraform import 'cloudflare_record.<resource_label>' <zone_id>/<record_id>
terraform import 'cloudflare_record.api_cname' "$ZONE_ID/<api の CNAME レコード ID>"
terraform import 'cloudflare_record.api_railway_verify' "$ZONE_ID/<_railway-verify.api の TXT レコード ID>"
terraform import 'cloudflare_record.realtime_cname' "$ZONE_ID/<realtime の CNAME レコード ID>"
terraform import 'cloudflare_record.realtime_railway_verify' "$ZONE_ID/<_railway-verify.realtime の TXT レコード ID>"
```

---

## 3. Pages プロジェクトの import

Account ID は Terraform Cloud の変数 `CLOUDFLARE_ACCOUNT_ID` または `terraform.tfvars` で設定している値を使用。

```bash
# 形式: terraform import 'cloudflare_pages_project.<resource_label>' <account_id>/<project_name>
terraform import 'cloudflare_pages_project.zedi' "<ACCOUNT_ID>/zedi"
terraform import 'cloudflare_pages_project.zedi_dev' "<ACCOUNT_ID>/zedi-dev"
```

---

## 4. 確認

```bash
terraform plan
```

差分がなければ、既存リソースが正しく state に取り込まれている。以降は `terraform apply` で変更を加えると、Terraform の定義が Cloudflare に反映される。

---

## 参考

- [Terraform import](https://developer.hashicorp.com/terraform/cli/import)
- [Cloudflare Provider: cloudflare_record](https://registry.terraform.io/providers/cloudflare/cloudflare/latest/docs/resources/record)
- [Cloudflare Provider: cloudflare_pages_project](https://registry.terraform.io/providers/cloudflare/cloudflare/latest/docs/resources/pages_project)
