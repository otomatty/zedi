# Zedi CDN Module - Variables

variable "environment" {
  description = "Environment name (dev, staging, prod)"
  type        = string
}

variable "domain_name" {
  description = "Custom domain for the frontend (e.g. zedi-note.app). Empty = CloudFront default domain only"
  type        = string
  default     = ""
}

variable "route53_zone_id" {
  description = "Route53 hosted zone ID for creating Alias record. Empty = no Route53 records (e.g. when using Cloudflare)"
  type        = string
  default     = ""
}

variable "create_route53_zone" {
  description = "Create a new Route53 hosted zone for domain_name. Not used when DNS is on Cloudflare"
  type        = bool
  default     = false
}

# When DNS is on Cloudflare, ACM is validated manually. Set to true after adding validation CNAME and cert is Issued.
variable "attach_custom_domain" {
  description = "Attach custom domain and ACM cert to CloudFront. Set to true after ACM cert is validated (e.g. after adding CNAME in Cloudflare)"
  type        = bool
  default     = true
}

variable "tags" {
  description = "Tags to apply to all resources"
  type        = map(string)
  default     = {}
}
