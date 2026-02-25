#!/usr/bin/env bash
# 本番インフラを一度 destroy してから apply し直すスクリプト
# 使い方: terraform/ で ./scripts/prod-destroy-then-apply.sh
# 注意: destroy に 5〜15 分かかることがあります。state ロックのため、並行して apply は実行できません。

set -e
cd "$(dirname "$0")/.."

echo "=== Terraform workspace: prod ==="
terraform workspace select prod

echo "=== Destroying prod infrastructure (this may take 5-15 minutes) ==="
terraform destroy -var-file=environments/prod.tfvars -auto-approve

echo "=== Applying prod infrastructure ==="
terraform apply -var-file=environments/prod.tfvars -auto-approve

echo "=== Done ==="
terraform output
