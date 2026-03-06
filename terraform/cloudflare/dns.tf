data "cloudflare_zone" "zedi" {
  name = var.zone_domain
}

# api.zedi-note.app -> Railway API
# Proxied by Cloudflare in normal operation (proxied=true).
# If Railway certificate issuance ever needs direct validation, temporarily set proxied=false, apply, then revert to true.
resource "cloudflare_record" "api_cname" {
  zone_id         = data.cloudflare_zone.zedi.id
  name            = "api"
  type            = "CNAME"
  content         = var.api_cname_target
  proxied         = true
  ttl             = 1    # 1 = auto
  allow_overwrite = true # adopt existing record if present
}

resource "cloudflare_record" "api_railway_verify" {
  zone_id = data.cloudflare_zone.zedi.id
  name    = "_railway-verify.api"
  type    = "TXT"
  content = var.api_railway_verify_txt
  ttl     = 1
}

# realtime.zedi-note.app -> Railway Hocuspocus
# Proxied by Cloudflare in normal operation (proxied=true).
# If Railway certificate issuance ever needs direct validation, temporarily set proxied=false, apply, then revert to true.
resource "cloudflare_record" "realtime_cname" {
  zone_id         = data.cloudflare_zone.zedi.id
  name            = "realtime"
  type            = "CNAME"
  content         = var.realtime_cname_target
  proxied         = true
  ttl             = 1
  allow_overwrite = true # adopt existing record if present
}

resource "cloudflare_record" "realtime_railway_verify" {
  zone_id = data.cloudflare_zone.zedi.id
  name    = "_railway-verify.realtime"
  type    = "TXT"
  content = var.realtime_railway_verify_txt
  ttl     = 1
}

# zedi-note.app -> Cloudflare Pages (zedi); proxied for SSL
resource "cloudflare_record" "pages_prod_cname" {
  zone_id = data.cloudflare_zone.zedi.id
  name    = "@"
  type    = "CNAME"
  content = "${cloudflare_pages_project.zedi.name}.pages.dev"
  proxied = true
  ttl     = 1
}

# dev.zedi-note.app -> Cloudflare Pages (zedi-dev); proxied for SSL
resource "cloudflare_record" "pages_dev_cname" {
  zone_id = data.cloudflare_zone.zedi.id
  name    = var.pages_dev_subdomain
  type    = "CNAME"
  content = "${cloudflare_pages_project.zedi_dev.name}.pages.dev"
  proxied = true
  ttl     = 1
}

# admin.zedi-note.app -> Cloudflare Pages (zedi-admin); proxied for SSL
resource "cloudflare_record" "pages_admin_cname" {
  zone_id = data.cloudflare_zone.zedi.id
  name    = var.pages_admin_subdomain
  type    = "CNAME"
  content = "${cloudflare_pages_project.zedi_admin.name}.pages.dev"
  proxied = true
  ttl     = 1
}
