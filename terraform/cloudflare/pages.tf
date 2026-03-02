# Cloudflare Pages projects (deployments are done via GitHub Actions wrangler-action)
resource "cloudflare_pages_project" "zedi" {
  account_id        = var.cloudflare_account_id
  name              = "zedi"
  production_branch = "main"
}

resource "cloudflare_pages_project" "zedi_dev" {
  account_id        = var.cloudflare_account_id
  name              = "zedi-dev"
  production_branch = "develop"
}
