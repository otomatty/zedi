# Zedi Subscription Module - Variables

variable "environment" {
  description = "Environment name (dev, staging, prod)"
  type        = string
}

variable "tags" {
  description = "Tags to apply to all resources"
  type        = map(string)
  default     = {}
}

variable "db_credentials_secret_arn" {
  description = "ARN of Secrets Manager secret for Aurora credentials"
  type        = string
}

variable "aurora_cluster_arn" {
  description = "Aurora cluster ARN for RDS Data API"
  type        = string
}

variable "aurora_database_name" {
  description = "Aurora database name"
  type        = string
  default     = "zedi"
}

variable "api_id" {
  description = "API Gateway HTTP API ID to attach webhook route"
  type        = string
}
