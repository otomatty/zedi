# Zedi AI API Module - Variables

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
# Cognito (for JWT verification in Lambda)
# =============================================================================

variable "cognito_user_pool_id" {
  description = "Cognito User Pool ID for JWT verification"
  type        = string
}

# =============================================================================
# Database (Aurora via RDS Data API)
# =============================================================================

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

# =============================================================================
# CORS
# =============================================================================

variable "cors_origin" {
  description = "Allowed CORS origins (comma-separated)"
  type        = string
  default     = "*"
}
