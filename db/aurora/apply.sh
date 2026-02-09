#!/usr/bin/env bash
# Apply Aurora DDL to dev (or URL given by DATABASE_URL).
# Requires: psql, and network access to Aurora (e.g. from same VPC or via Bastion).
#
# Usage:
#   # Use existing DATABASE_URL
#   ./apply.sh
#
#   # Or fetch from Secrets Manager (dev) and apply
#   AWS_PROFILE=your-profile ./apply.sh --secret zedi-dev-db-credentials

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SECRET_ID=""

while [[ $# -gt 0 ]]; do
  case $1 in
    --secret)
      SECRET_ID="$2"
      shift 2
      ;;
    *)
      echo "Unknown option: $1"
      echo "Usage: $0 [--secret SECRET_ID]"
      exit 1
      ;;
  esac
done

if [[ -n "$SECRET_ID" ]]; then
  echo "Fetching connection info from Secrets Manager: $SECRET_ID"
  RAW=$(aws secretsmanager get-secret-value --secret-id "$SECRET_ID" --query SecretString --output text)
  DB_USER=$(echo "$RAW" | jq -r .username)
  DB_PASS=$(echo "$RAW" | jq -r .password)
  DB_HOST=$(echo "$RAW" | jq -r .host)
  DB_PORT=$(echo "$RAW" | jq -r .port)
  DB_NAME=$(echo "$RAW" | jq -r .dbname)
  export PGPASSWORD="$DB_PASS"
  CONN="postgresql://${DB_USER}@${DB_HOST}:${DB_PORT}/${DB_NAME}"
else
  if [[ -z "${DATABASE_URL:-}" ]]; then
    echo "Set DATABASE_URL or use --secret zedi-dev-db-credentials"
    exit 1
  fi
  CONN="$DATABASE_URL"
fi

echo "Applying 001_schema.sql ..."
psql "$CONN" -f "$SCRIPT_DIR/001_schema.sql"
echo "Done."
