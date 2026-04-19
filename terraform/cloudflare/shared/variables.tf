variable "cloudflare_api_token" {
  type        = string
  description = "Cloudflare API token. In CI: TF_VAR_cloudflare_api_token from secrets. Locally: -var or TF_VAR_cloudflare_api_token"
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

variable "api_cname_target" {
  type        = string
  description = "CNAME target for api.zedi-note.app (Railway API service)"
  default     = "2yg7k4yt.up.railway.app"
}

variable "api_railway_verify_txt" {
  type        = string
  description = "TXT content for _railway-verify.api (Railway domain verification). Provide via Terraform Cloud workspace variable, TF_VAR_api_railway_verify_txt, or terraform.tfvars (gitignored)."
  sensitive   = true
}

variable "realtime_cname_target" {
  type        = string
  description = "CNAME target for realtime.zedi-note.app (Railway Hocuspocus service)"
  default     = "nnkek1wf.up.railway.app"
}

variable "realtime_railway_verify_txt" {
  type        = string
  description = "TXT content for _railway-verify.realtime (Railway domain verification). Provide via Terraform Cloud workspace variable, TF_VAR_realtime_railway_verify_txt, or terraform.tfvars (gitignored)."
  sensitive   = true
}
