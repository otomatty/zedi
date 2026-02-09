# Zedi Infrastructure - Outputs

# =============================================================================
# General
# =============================================================================
output "aws_account_id" {
  description = "AWS Account ID"
  value       = data.aws_caller_identity.current.account_id
}

output "aws_region" {
  description = "AWS Region"
  value       = data.aws_region.current.name
}

output "environment" {
  description = "Environment name"
  value       = var.environment
}

# =============================================================================
# Networking
# =============================================================================
output "vpc_id" {
  description = "VPC ID"
  value       = module.networking.vpc_id
}

output "public_subnet_ids" {
  description = "Public subnet IDs"
  value       = module.networking.public_subnet_ids
}

output "private_subnet_ids" {
  description = "Private subnet IDs"
  value       = module.networking.private_subnet_ids
}

# =============================================================================
# Database (Aurora)
# =============================================================================
output "aurora_cluster_endpoint" {
  description = "Aurora cluster endpoint (writer)"
  value       = module.database.cluster_endpoint
}

output "aurora_reader_endpoint" {
  description = "Aurora cluster reader endpoint"
  value       = module.database.cluster_reader_endpoint
}

output "aurora_database_name" {
  description = "Aurora database name"
  value       = module.database.database_name
}

output "db_credentials_secret_arn" {
  description = "ARN of Secrets Manager secret for DB credentials"
  value       = module.database.db_credentials_secret_arn
}

# =============================================================================
# Cache (Redis)
# =============================================================================
output "redis_endpoint" {
  description = "ElastiCache Redis primary endpoint"
  value       = module.cache.redis_endpoint
}

output "redis_connection_string" {
  description = "Redis connection string (TLS enabled)"
  value       = module.cache.redis_connection_string
}

# =============================================================================
# Realtime (ECS/ALB)
# =============================================================================
output "alb_dns_name" {
  description = "ALB DNS name for WebSocket connections"
  value       = module.realtime.alb_dns_name
}

output "websocket_url" {
  description = "WebSocket URL for Hocuspocus"
  value       = module.realtime.websocket_url
}

output "ecr_repository_url" {
  description = "ECR repository URL for Hocuspocus image"
  value       = module.realtime.ecr_repository_url
}

output "ecs_cluster_name" {
  description = "ECS cluster name"
  value       = module.realtime.ecs_cluster_name
}

output "ecs_service_name" {
  description = "ECS service name"
  value       = module.realtime.ecs_service_name
}

# =============================================================================
# CDN (CloudFront, S3)
# =============================================================================
output "cloudfront_distribution_id" {
  description = "CloudFront distribution ID (for cache invalidation)"
  value       = module.cdn.distribution_id
}

output "cloudfront_domain_name" {
  description = "CloudFront distribution domain name (xxx.cloudfront.net)"
  value       = module.cdn.distribution_domain_name
}

output "frontend_url" {
  description = "Frontend URL"
  value       = module.cdn.frontend_url
}

output "frontend_s3_bucket" {
  description = "S3 bucket name for frontend deploy (aws s3 sync dist/ s3://<this>)"
  value       = module.cdn.bucket_id
}

output "acm_certificate_domain_validation_options" {
  description = "CNAME records for ACM DNS validation - add these in Cloudflare to issue the certificate (us-east-1)"
  value       = module.cdn.acm_certificate_domain_validation_options
}

# =============================================================================
# REST API (Lambda + API Gateway)
# =============================================================================
output "api_invoke_url" {
  description = "REST API invoke URL (use as base for /api/*)"
  value       = module.api.invoke_url
}

# =============================================================================
# Security (Cognito, IAM)
# =============================================================================
output "cognito_user_pool_id" {
  description = "Cognito User Pool ID"
  value       = module.security.user_pool_id
}

output "cognito_user_pool_endpoint" {
  description = "Cognito User Pool endpoint"
  value       = module.security.user_pool_endpoint
}

output "cognito_client_id" {
  description = "Cognito App Client ID"
  value       = module.security.user_pool_client_id
}

output "cognito_hosted_ui_url" {
  description = "Cognito Hosted UI URL"
  value       = module.security.cognito_hosted_ui_url
}

output "ecs_execution_role_arn" {
  description = "ECS Task Execution Role ARN"
  value       = module.security.ecs_execution_role_arn
}

output "ecs_task_role_arn" {
  description = "ECS Task Role ARN"
  value       = module.security.ecs_task_role_arn
}
