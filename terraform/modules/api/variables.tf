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
