# Cloudflare Pages: production frontend + admin (deployments via GitHub Actions wrangler-action)
resource "cloudflare_pages_project" "zedi" {
  account_id        = var.cloudflare_account_id
  name              = "zedi"
  production_branch = "main"
}

resource "cloudflare_pages_project" "zedi_admin" {
  account_id        = var.cloudflare_account_id
  name              = "zedi-admin"
  production_branch = "main"
}

resource "cloudflare_pages_domain" "zedi_prod" {
  account_id   = var.cloudflare_account_id
  project_name = cloudflare_pages_project.zedi.name
  domain       = var.zone_domain
}

resource "cloudflare_pages_domain" "zedi_admin" {
  account_id   = var.cloudflare_account_id
  project_name = cloudflare_pages_project.zedi_admin.name
  domain       = "${var.pages_admin_subdomain}.${var.zone_domain}"
}
