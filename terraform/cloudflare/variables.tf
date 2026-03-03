variable "cloudflare_api_token" {
  type        = string
  description = "Cloudflare API token. In Terraform Cloud: set as Terraform variable (sensitive). Locally: -var or TF_VAR_cloudflare_api_token"
  sensitive   = true
}

variable "cloudflare_account_id" {
  type        = string
  description = "Cloudflare account ID"
}

variable "zone_domain" {
  type        = string
  description = "DNS zone domain (e.g. zedi-note.app)"
  default     = "zedi-note.app"
}

# Pages dev frontend custom subdomain (e.g. dev.zedi-note.app)
variable "pages_dev_subdomain" {
  type        = string
  description = "Subdomain for dev frontend (Pages zedi-dev), e.g. dev -> dev.zedi-note.app"
  default     = "dev"
}

# Railway API subdomain CNAME targets (from Railway custom domain)
variable "api_cname_target" {
  type        = string
  description = "CNAME target for api.zedi-note.app (Railway API service)"
  default     = "2yg7k4yt.up.railway.app"
}

variable "api_railway_verify_txt" {
  type        = string
  description = "TXT content for _railway-verify.api (Railway domain verification)"
  sensitive   = true
  default     = "railway-verify=railway-verify=97b0cf3ce5de53d394f30217a4788eec389f509a8ab5013a90a0c7c0d23cd629"
}

variable "realtime_cname_target" {
  type        = string
  description = "CNAME target for realtime.zedi-note.app (Railway Hocuspocus service)"
  default     = "nnkek1wf.up.railway.app"
}

variable "realtime_railway_verify_txt" {
  type        = string
  description = "TXT content for _railway-verify.realtime (Railway domain verification)"
  sensitive   = true
  default     = "railway-verify=railway-verify=b08709e7971274931c697417f9b8f8fc4d0ab61ef8a7690ababd25b8447d1a78"
}
