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

# Custom domain for production frontend (zedi-note.app)
resource "cloudflare_pages_domain" "zedi_prod" {
  account_id   = var.cloudflare_account_id
  project_name = cloudflare_pages_project.zedi.name
  domain       = var.zone_domain
}

# Custom domain for dev frontend (e.g. dev.zedi-note.app)
resource "cloudflare_pages_domain" "zedi_dev" {
  account_id   = var.cloudflare_account_id
  project_name = cloudflare_pages_project.zedi_dev.name
  domain       = "${var.pages_dev_subdomain}.${var.zone_domain}"
}
