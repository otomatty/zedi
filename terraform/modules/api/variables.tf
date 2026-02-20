# Zedi REST API Module - Variables

variable "environment" {
  description = "Environment name (dev, staging, prod)"
  type        = string
}

variable "tags" {
  description = "Tags to apply to all resources"
  type        = map(string)
  default     = {}
}

# =============================================================================
# Cognito (for JWT Authorizer)
# =============================================================================

variable "cognito_user_pool_id" {
  description = "Cognito User Pool ID for JWT authorizer"
  type        = string
}

variable "cognito_user_pool_client_id" {
  description = "Cognito User Pool Client ID (audience for JWT)"
  type        = string
}

# =============================================================================
# CORS
# =============================================================================

variable "cors_origin" {
  description = "Allowed CORS origin (e.g. https://zedi-note.app for prod, * for dev)"
  type        = string
  default     = "*"
}

# =============================================================================
# Optional: Database (for Lambda env; C1-3 以降で使用)
# =============================================================================

variable "db_credentials_secret_arn" {
  description = "ARN of Secrets Manager secret for Aurora credentials (optional)"
  type        = string
  default     = ""
}

variable "aurora_cluster_arn" {
  description = "Aurora cluster ARN for RDS Data API (optional)"
  type        = string
  default     = ""
}

variable "aurora_database_name" {
  description = "Aurora database name"
  type        = string
  default     = "zedi"
}

# =============================================================================
# Cross-module resources (統合 Lambda が使用)
# =============================================================================

variable "ai_secrets_arn" {
  description = "ARN of AI provider keys secret (from ai-api module)"
  type        = string
  default     = ""
}

variable "rate_limit_table_name" {
  description = "DynamoDB table name for rate limiting (from ai-api module)"
  type        = string
  default     = ""
}

variable "rate_limit_table_arn" {
  description = "DynamoDB table ARN for rate limiting (from ai-api module)"
  type        = string
  default     = ""
}

variable "thumbnail_secrets_arn" {
  description = "ARN of thumbnail keys secret (from thumbnail-api module)"
  type        = string
  default     = ""
}

variable "thumbnails_bucket_name" {
  description = "S3 bucket name for thumbnails (from thumbnail-api module)"
  type        = string
  default     = ""
}

variable "thumbnails_bucket_arn" {
  description = "S3 bucket ARN for thumbnails (from thumbnail-api module)"
  type        = string
  default     = ""
}

variable "thumbnail_cloudfront_url" {
  description = "CloudFront URL for thumbnail delivery (from thumbnail-api module)"
  type        = string
  default     = ""
}

variable "lemonsqueezy_secret_arn" {
  description = "ARN of LemonSqueezy secret (from subscription module)"
  type        = string
  default     = ""
}

variable "websocket_api_execution_arn" {
  description = "WebSocket API execution ARN for execute-api:ManageConnections (from ai-api module)"
  type        = string
  default     = ""
}
