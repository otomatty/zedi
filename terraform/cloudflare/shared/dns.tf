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
  ttl             = 1
  allow_overwrite = true
}

resource "cloudflare_record" "api_railway_verify" {
  zone_id         = data.cloudflare_zone.zedi.id
  name            = "_railway-verify.api"
  type            = "TXT"
  content         = var.api_railway_verify_txt
  ttl             = 1
  allow_overwrite = true

  lifecycle {
    # provider が自動調整する属性のみ無視し、TXT の検証トークン更新は Terraform で反映する
    ignore_changes = [ttl, tags]
  }
}

# realtime.zedi-note.app -> Railway Hocuspocus
resource "cloudflare_record" "realtime_cname" {
  zone_id         = data.cloudflare_zone.zedi.id
  name            = "realtime"
  type            = "CNAME"
  content         = var.realtime_cname_target
  proxied         = true
  ttl             = 1
  allow_overwrite = true
}

resource "cloudflare_record" "realtime_railway_verify" {
  zone_id         = data.cloudflare_zone.zedi.id
  name            = "_railway-verify.realtime"
  type            = "TXT"
  content         = var.realtime_railway_verify_txt
  ttl             = 1
  allow_overwrite = true

  lifecycle {
    # provider が自動調整する属性のみ無視し、TXT の検証トークン更新は Terraform で反映する
    ignore_changes = [ttl, tags]
  }
}
