#!/usr/bin/env bash
# One-time script: migrate Terraform workspace "default" → "dev"
#
# The default workspace currently manages dev resources.
# This script copies the state to a new "dev" workspace so that
# CI/CD can use explicit workspace names (dev / prod).
#
# Prerequisites:
#   - AWS CLI configured (same credentials used for terraform apply)
#   - Working directory: repository root (the script cd's into terraform/)
#   - Secret env vars loaded (to verify plan shows no changes)
#
# Usage (Git Bash / WSL):
#   bash scripts/terraform/migrate-workspace-default-to-dev.sh
#
# PowerShell equivalent steps are in comments below.

set -euo pipefail

TERRAFORM_DIR="$(cd "$(dirname "$0")/../../terraform" && pwd)"
cd "$TERRAFORM_DIR"

echo "=== Terraform workspace migration: default → dev ==="
echo "Working directory: $(pwd)"
echo ""

# ---- Step 1: Ensure we're on the default workspace ----
terraform workspace select default
echo "[1/6] Selected workspace: default"

# ---- Step 2: Pull current state (backup) ----
STATE_BACKUP="$(pwd)/default-state-backup.json"
terraform state pull > "$STATE_BACKUP"
echo "[2/6] State backed up to: $STATE_BACKUP"
echo "       (Keep this file until migration is verified)"

# ---- Step 3: Create dev workspace ----
if terraform workspace list | grep -q '  dev$'; then
  echo "[3/6] Workspace 'dev' already exists — selecting it"
  terraform workspace select dev
else
  terraform workspace new dev
  echo "[3/6] Created workspace: dev"
fi

# ---- Step 4: Push state to dev workspace ----
terraform state push "$STATE_BACKUP"
echo "[4/6] State pushed to dev workspace"

# ---- Step 5: Verify with plan ----
echo ""
echo "[5/6] Verifying — running terraform plan..."
echo "       Make sure TF_VAR_* secrets are loaded (source environments/dev.secret.env)"
echo ""

if terraform plan -var-file=environments/dev.tfvars -detailed-exitcode 2>&1; then
  echo ""
  echo "[5/6] Plan shows NO CHANGES — migration verified successfully"
else
  EXIT_CODE=$?
  if [ "$EXIT_CODE" -eq 2 ]; then
    echo ""
    echo "[5/6] WARNING: Plan shows changes. This may be because TF_VAR_* secrets"
    echo "       are not loaded. Load them and re-run plan manually:"
    echo "         set -a && source environments/dev.secret.env && set +a"
    echo "         terraform plan -var-file=environments/dev.tfvars"
  else
    echo ""
    echo "[5/6] ERROR: terraform plan failed (exit code $EXIT_CODE)"
    echo "       Review the output above. To rollback:"
    echo "         terraform workspace select default"
    echo "         terraform state push $STATE_BACKUP"
    exit 1
  fi
fi

echo ""
echo "[6/6] Migration complete!"
echo ""
echo "  Workspace 'dev' now manages dev infrastructure."
echo "  The 'default' workspace is now empty."
echo ""
echo "  Next steps:"
echo "    1. Verify: terraform workspace list"
echo "    2. Baseline DB migrations:"
echo "       cd ../db/aurora && node migrate.mjs --baseline 007"
echo "    3. Set up GitHub Environments (dev / prod) with required secrets"
echo "    4. Push to develop/main to trigger CI/CD"
echo ""
echo "  Backup state file: $STATE_BACKUP"
echo "  You can delete it after confirming everything works."

# ---- PowerShell equivalent steps ----
# cd terraform
# terraform workspace select default
# terraform state pull | Out-File -Encoding utf8 default-state-backup.json
# terraform workspace new dev  # or: terraform workspace select dev
# terraform state push default-state-backup.json
# Get-Content environments/dev.secret.env | ForEach-Object {
#   if ($_ -match '^([^#=]+)=(.*)$') {
#     [Environment]::SetEnvironmentVariable($matches[1], $matches[2], 'Process')
#   }
# }
# terraform plan -var-file=environments/dev.tfvars
