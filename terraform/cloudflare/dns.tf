data "cloudflare_zone" "zedi" {
  name = var.zone_domain
}

# api.zedi-note.app -> Railway API (DNS only; proxied = false for Railway SSL)
resource "cloudflare_record" "api_cname" {
  zone_id         = data.cloudflare_zone.zedi.id
  name            = "api"
  type            = "CNAME"
  content         = var.api_cname_target
  proxied         = false
  ttl             = 1 # 1 = auto
  allow_overwrite = true # adopt existing record if present
}

resource "cloudflare_record" "api_railway_verify" {
  zone_id = data.cloudflare_zone.zedi.id
  name    = "_railway-verify.api"
  type    = "TXT"
  content = var.api_railway_verify_txt
  ttl     = 1
}

# realtime.zedi-note.app -> Railway Hocuspocus (DNS only)
resource "cloudflare_record" "realtime_cname" {
  zone_id         = data.cloudflare_zone.zedi.id
  name            = "realtime"
  type            = "CNAME"
  content         = var.realtime_cname_target
  proxied         = false
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
