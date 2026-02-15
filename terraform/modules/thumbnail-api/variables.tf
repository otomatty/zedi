# Zedi Thumbnail API Module - Variables

variable "environment" {
  description = "Environment name (dev, staging, prod)"
  type        = string
}

variable "tags" {
  description = "Tags to apply to all resources"
  type        = map(string)
  default     = {}
}

variable "cognito_user_pool_id" {
  description = "Cognito User Pool ID for JWT verification"
  type        = string
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
  description = "API Gateway HTTP API ID to add thumbnail routes"
  type        = string
}

variable "api_execution_arn" {
  description = "API Gateway execution ARN for Lambda invoke permission"
  type        = string
}

variable "authorizer_id" {
  description = "JWT authorizer ID for API Gateway routes"
  type        = string
}

variable "rate_limit_table_name" {
  description = "DynamoDB table name for rate limiting (shared with ai-api)"
  type        = string
}

variable "ai_secrets_arn" {
  description = "ARN of Secrets Manager secret for AI provider keys (GOOGLE_AI_API_KEY for Gemini)"
  type        = string
}

variable "cors_origin" {
  description = "Allowed CORS origins"
  type        = string
  default     = "*"
}

# Optional: set via root module to register secret values with Terraform
variable "google_custom_search_api_key" {
  description = "Google Custom Search API key (sensitive). Empty = create secret with placeholder; set to register value."
  type        = string
  default     = ""
  sensitive   = true
}

variable "google_custom_search_engine_id" {
  description = "Google Custom Search Engine ID / cx (sensitive)."
  type        = string
  default     = ""
  sensitive   = true
}
