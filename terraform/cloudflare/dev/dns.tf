data "cloudflare_zone" "zedi" {
  name = var.zone_domain
}

# dev.zedi-note.app -> Cloudflare Pages (zedi-dev)
resource "cloudflare_record" "pages_dev_cname" {
  zone_id         = data.cloudflare_zone.zedi.id
  name            = var.pages_dev_subdomain
  type            = "CNAME"
  content         = "${cloudflare_pages_project.zedi_dev.name}.pages.dev"
  proxied         = true
  ttl             = 1
  allow_overwrite = true
}
