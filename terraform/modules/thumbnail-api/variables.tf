# Zedi Thumbnail API Module - Variables
# Phase 0-B: Lambda は api モジュールに統合。S3 + CloudFront + Secrets のみ残存。

variable "environment" {
  description = "Environment name (dev, staging, prod)"
  type        = string
}

variable "tags" {
  description = "Tags to apply to all resources"
  type        = map(string)
  default     = {}
}

variable "google_custom_search_api_key" {
  description = "Google Custom Search API key (sensitive)"
  type        = string
  default     = ""
  sensitive   = true
}

variable "google_custom_search_engine_id" {
  description = "Google Custom Search Engine ID / cx (sensitive)"
  type        = string
  default     = ""
  sensitive   = true
}
