# Cloudflare Pages: dev frontend (deployments via GitHub Actions wrangler-action)
resource "cloudflare_pages_project" "zedi_dev" {
  account_id        = var.cloudflare_account_id
  name              = "zedi-dev"
  production_branch = "develop"
}

resource "cloudflare_pages_domain" "zedi_dev" {
  account_id   = var.cloudflare_account_id
  project_name = cloudflare_pages_project.zedi_dev.name
  domain       = "${var.pages_dev_subdomain}.${var.zone_domain}"
}
