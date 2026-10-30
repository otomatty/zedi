> **Language:** English | [日本語](README.ja.md)

# Cloudflare Terraform (3-stack layout)

Cloudflare resources are split into **shared / dev / prod** stacks so dev and prod apply at different times.

## Directories and roles

| Stack      | Directory | Terraform Cloud Workspace | Resources managed                                                                                |
| ---------- | --------- | ------------------------- | ------------------------------------------------------------------------------------------------ |
| **shared** | `shared/` | `cloudflare-shared`       | Zone reference only (the api/realtime Railway records were removed)                              |
| **dev**    | `dev/`    | `cloudflare-dev`          | Pages `zedi-dev` and `zedi-admin-dev`; DNS for `dev.zedi-note.app` and `admin-dev.zedi-note.app` |
| **prod**   | `prod/`   | `cloudflare-prod`         | Pages `zedi` and `zedi-admin`; DNS for `zedi-note.app` and `admin.zedi-note.app`                 |

## Apply timing

- **shared**: Infrequent changes. Plan on PR; run **Apply Shared** via manual `workflow_dispatch` only.
- **dev**: Auto-apply on push to `develop` when `terraform/cloudflare/dev/**` changes. Plan on PR.
- **prod**: Auto-apply on push to `main` when `terraform/cloudflare/prod/**` changes. Plan on PR. `deploy-prod` Deploy Admin runs after `apply-cloudflare-prod`.

## Cloudflare token and Account ID

**All three workspaces (shared / dev / prod) may use the same `cloudflare_api_token` and `cloudflare_account_id`** — one Cloudflare account and zone.

| Location             | Purpose                                                                                 |
| -------------------- | --------------------------------------------------------------------------------------- |
| **Terraform Cloud**  | Register the same values as Terraform variables in each workspace (local / manual runs) |
| **terraform.tfvars** | Copy each stack's `terraform.tfvars.example` to `terraform.tfvars` with the same values |
| **GitHub Secrets**   | `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` in GitHub Environments (CI runs)     |

See [HashiCorp Terraform Cloud docs](https://developer.hashicorp.com/terraform/cloud-docs) for workspace variables and token creation (no long in-repo guide).

## Removed Railway records (shared)

Railway is no longer used, so the `api` / `realtime` CNAME records and their `_railway-verify` TXT records were removed from the `shared` stack. The next manual **Apply Shared** deletes them from the zone. Remove the `*_railway_verify_txt` variables from the `cloudflare-shared` workspace as well.

## Local execution

Each stack is independent. Create **three Terraform Cloud workspaces** and set variables (same token and Account ID is fine).

```bash
# Example: shared plan (vars set in Terraform Cloud or terraform.tfvars)
cd terraform/cloudflare/shared
terraform init
# If unset, pass via env:
# export TF_VAR_cloudflare_api_token="..."
# export TF_VAR_cloudflare_account_id="..."
terraform plan
```

Copy each directory's `terraform.tfvars.example` to `terraform.tfvars` or set the **same values** in each Terraform Cloud workspace.

## CI variables

GitHub Actions uses these Secrets in Environments (development / production):

- `TF_API_TOKEN` — Terraform Cloud auth (backend)
- `CLOUDFLARE_API_TOKEN` — Provider (`TF_VAR_cloudflare_api_token`)
- `CLOUDFLARE_ACCOUNT_ID` — Provider (`TF_VAR_cloudflare_account_id`)

Workflows pass these as `TF_VAR_*` so plan/apply works as-is.

## External references

- [Terraform Cloud](https://developer.hashicorp.com/terraform/cloud-docs) — Workspaces, variables, runs
- [Cloudflare Provider](https://registry.terraform.io/providers/cloudflare/cloudflare/latest/docs) — DNS, zones
