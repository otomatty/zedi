#!/usr/bin/env bash
# 既存の Cloudflare リソースを Terraform state に import する。
# 事前に export CLOUDFLARE_API_TOKEN=... と CLOUDFLARE_ACCOUNT_ID=... を設定すること。
# 実行: bash scripts/import-existing.sh（terraform/cloudflare から）

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# ROOT_DIR = terraform/cloudflare（scripts の1つ上）
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ZONE_ID="${ZONE_ID:-6022417d0607fbaf4b7914b39ac61fe5}"
ACCOUNT_ID="${CLOUDFLARE_ACCOUNT_ID:-}"

if [ -z "${CLOUDFLARE_API_TOKEN}" ]; then
  echo "Error: CLOUDFLARE_API_TOKEN is not set. Export it first." >&2
  exit 1
fi
if [ -z "${ACCOUNT_ID}" ]; then
  echo "Error: CLOUDFLARE_ACCOUNT_ID is not set. Export it first." >&2
  exit 1
fi

export TF_VAR_cloudflare_api_token="${CLOUDFLARE_API_TOKEN}"
export TF_VAR_cloudflare_account_id="${ACCOUNT_ID}"

echo "Fetching DNS record IDs from Cloudflare..."
RECORDS_JSON=$(curl -s -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records")

# JSON から name/type に一致するレコードの id を取得（Node.js を使用。Bun でも可）
get_id() {
  local name="$1" type="$2"
  if command -v node >/dev/null 2>&1; then
    echo "$RECORDS_JSON" | node -e "
      const chunks = [];
      process.stdin.on('data', c => chunks.push(c));
      process.stdin.on('end', () => {
        const d = JSON.parse(Buffer.concat(chunks).toString());
        const n = process.argv[1], t = process.argv[2];
        const r = d.result && d.result.find(x => x.name === n && x.type === t);
        if (r) console.log(r.id);
      });
    " "$name" "$type"
  elif command -v bun >/dev/null 2>&1; then
    echo "$RECORDS_JSON" | bun -e "
      const d = JSON.parse(await new Response(process.stdin).text());
      const n = process.argv[1], t = process.argv[2];
      const r = d.result && d.result.find(x => x.name === n && x.type === t);
      if (r) console.log(r.id);
    " "$name" "$type"
  else
    echo "Error: node or bun is required to parse JSON. Install Node.js or run: winget install OpenJS.NodeJS" >&2
    exit 1
  fi
}

# name は Cloudflare が返す FQDN
ID_API_CNAME=$(get_id "api.zedi-note.app" "CNAME")
ID_API_TXT=$(get_id "_railway-verify.api.zedi-note.app" "TXT")
ID_REALTIME_CNAME=$(get_id "realtime.zedi-note.app" "CNAME")
ID_REALTIME_TXT=$(get_id "_railway-verify.realtime.zedi-note.app" "TXT")
ID_DEV_CNAME=$(get_id "dev.zedi-note.app" "CNAME")
ID_APEX_CNAME=$(get_id "zedi-note.app" "CNAME")
ID_ADMIN_CNAME=$(get_id "admin.zedi-note.app" "CNAME")

import_shared() {
  echo "--- shared ---"
  cd "$ROOT_DIR/shared"
  [ -n "$ID_API_CNAME" ]     && terraform import -input=false 'cloudflare_record.api_cname'             "$ZONE_ID/$ID_API_CNAME"     || echo "Skip api CNAME (not found)"
  [ -n "$ID_API_TXT" ]       && terraform import -input=false 'cloudflare_record.api_railway_verify'     "$ZONE_ID/$ID_API_TXT"       || echo "Skip _railway-verify.api TXT (not found)"
  [ -n "$ID_REALTIME_CNAME" ] && terraform import -input=false 'cloudflare_record.realtime_cname'       "$ZONE_ID/$ID_REALTIME_CNAME" || echo "Skip realtime CNAME (not found)"
  [ -n "$ID_REALTIME_TXT" ]  && terraform import -input=false 'cloudflare_record.realtime_railway_verify' "$ZONE_ID/$ID_REALTIME_TXT"  || echo "Skip _railway-verify.realtime TXT (not found)"
}

import_dev() {
  echo "--- dev ---"
  cd "$ROOT_DIR/dev"
  terraform import -input=false 'cloudflare_pages_project.zedi_dev' "$ACCOUNT_ID/zedi-dev"
  [ -n "$ID_DEV_CNAME" ] && terraform import -input=false 'cloudflare_record.pages_dev_cname' "$ZONE_ID/$ID_DEV_CNAME" || echo "Skip dev CNAME (not found)"
  # cloudflare_pages_domain は apply で作成されるか既存なら import。ID 形式: account_id/project_name/domain
  terraform import -input=false 'cloudflare_pages_domain.zedi_dev' "$ACCOUNT_ID/zedi-dev/dev.zedi-note.app" 2>/dev/null || echo "Skip pages_domain (optional)"
}

import_prod() {
  echo "--- prod ---"
  cd "$ROOT_DIR/prod"
  terraform import -input=false 'cloudflare_pages_project.zedi' "$ACCOUNT_ID/zedi"
  terraform import -input=false 'cloudflare_pages_project.zedi_admin' "$ACCOUNT_ID/zedi-admin"
  [ -n "$ID_APEX_CNAME" ]  && terraform import -input=false 'cloudflare_record.pages_prod_cname'  "$ZONE_ID/$ID_APEX_CNAME"  || echo "Skip apex CNAME (not found)"
  [ -n "$ID_ADMIN_CNAME" ] && terraform import -input=false 'cloudflare_record.pages_admin_cname' "$ZONE_ID/$ID_ADMIN_CNAME" || echo "Skip admin CNAME (not found)"
  terraform import -input=false 'cloudflare_pages_domain.zedi_prod'  "$ACCOUNT_ID/zedi/zedi-note.app"        2>/dev/null || echo "Skip pages_domain zedi_prod (optional)"
  terraform import -input=false 'cloudflare_pages_domain.zedi_admin' "$ACCOUNT_ID/zedi-admin/admin.zedi-note.app" 2>/dev/null || echo "Skip pages_domain zedi_admin (optional)"
}

import_shared
import_dev
import_prod

echo "--- Done. Run 'terraform plan' in each stack to verify (expect No changes). ---"
