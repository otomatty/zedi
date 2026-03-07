variable "cloudflare_api_token" {
  type        = string
  description = "Cloudflare API token. In CI: TF_VAR_cloudflare_api_token from secrets."
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

variable "pages_admin_subdomain" {
  type        = string
  description = "Subdomain for admin frontend (e.g. admin -> admin.zedi-note.app)"
  default     = "admin"
}
