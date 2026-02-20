# Zedi Subscription Module - Variables
# Phase 0-B: Lambda は api モジュールに統合。Secrets Manager のみ残存。

variable "environment" {
  description = "Environment name (dev, staging, prod)"
  type        = string
}

variable "tags" {
  description = "Tags to apply to all resources"
  type        = map(string)
  default     = {}
}
