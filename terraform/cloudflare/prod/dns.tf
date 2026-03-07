data "cloudflare_zone" "zedi" {
  name = var.zone_domain
}

# zedi-note.app (apex) -> Cloudflare Pages (zedi). name は API と一致させるため zone のドメインを指定（"@" でも同等だが import 済み state は zedi-note.app）
resource "cloudflare_record" "pages_prod_cname" {
  zone_id         = data.cloudflare_zone.zedi.id
  name            = var.zone_domain
  type            = "CNAME"
  content         = "${cloudflare_pages_project.zedi.name}.pages.dev"
  proxied         = true
  ttl             = 1
  allow_overwrite = true
}

# admin.zedi-note.app -> Cloudflare Pages (zedi-admin)
resource "cloudflare_record" "pages_admin_cname" {
  zone_id         = data.cloudflare_zone.zedi.id
  name            = var.pages_admin_subdomain
  type            = "CNAME"
  content         = "${cloudflare_pages_project.zedi_admin.name}.pages.dev"
  proxied         = true
  ttl             = 1
  allow_overwrite = true
}
