#!/usr/bin/env bash
# Cloudflare ゾーンの DNS レコード一覧を取得し、import に必要な ID を name/type で表示する。
# 使用: export CLOUDFLARE_API_TOKEN=... のうえで ./fetch-dns-record-ids.sh
# 出力を確認してから import コマンドで使用する。

set -euo pipefail

if [ -z "${CLOUDFLARE_API_TOKEN:-}" ]; then
  echo "Error: CLOUDFLARE_API_TOKEN is not set. Export it first." >&2
  exit 1
fi
if [ -z "${ZONE_ID:-}" ]; then
  echo "Error: ZONE_ID is not set. Export it first." >&2
  exit 1
fi

echo "Fetching DNS records for zone $ZONE_ID..."
RESPONSE=$(curl -fsS -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records")

echo "$RESPONSE" | jq -er '
  select(.success == true)
  | .result[]
  | "\(.name)\t\(.type)\t\(.id)"
' | sort
