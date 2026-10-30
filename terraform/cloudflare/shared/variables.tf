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
