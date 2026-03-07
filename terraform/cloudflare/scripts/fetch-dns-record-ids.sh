#!/usr/bin/env bash
# Cloudflare ゾーンの DNS レコード一覧を取得し、import に必要な ID を name/type で表示する。
# 使用: export CLOUDFLARE_API_TOKEN=... のうえで ./fetch-dns-record-ids.sh
# 出力を確認してから import コマンドで使用する。

set -e
ZONE_ID="${ZONE_ID:-6022417d0607fbaf4b7914b39ac61fe5}"

if [ -z "${CLOUDFLARE_API_TOKEN}" ]; then
  echo "Error: CLOUDFLARE_API_TOKEN is not set. Export it first." >&2
  exit 1
fi

echo "Fetching DNS records for zone $ZONE_ID..."
curl -s -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records" | jq -r '
  .result[] | "\(.name)\t\(.type)\t\(.id)"' | sort
