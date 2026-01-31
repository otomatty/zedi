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
# Database (Aurora) - Uncomment when module is enabled
# =============================================================================
# output "aurora_cluster_endpoint" {
#   description = "Aurora cluster endpoint"
#   value       = module.database.cluster_endpoint
# }
#
# output "aurora_reader_endpoint" {
#   description = "Aurora reader endpoint"
#   value       = module.database.reader_endpoint
# }

# =============================================================================
# Cache (Redis) - Uncomment when module is enabled
# =============================================================================
# output "redis_endpoint" {
#   description = "ElastiCache Redis endpoint"
#   value       = module.cache.redis_endpoint
# }

# =============================================================================
# Realtime (ECS/ALB) - Uncomment when module is enabled
# =============================================================================
# output "alb_dns_name" {
#   description = "ALB DNS name for WebSocket connections"
#   value       = module.realtime.alb_dns_name
# }
#
# output "websocket_url" {
#   description = "WebSocket URL for Hocuspocus"
#   value       = "wss://${module.realtime.alb_dns_name}"
# }

# =============================================================================
# CDN (CloudFront) - Uncomment when module is enabled
# =============================================================================
# output "cloudfront_distribution_id" {
#   description = "CloudFront distribution ID"
#   value       = module.cdn.distribution_id
# }
#
# output "cloudfront_domain_name" {
#   description = "CloudFront domain name"
#   value       = module.cdn.domain_name
# }
#
# output "frontend_url" {
#   description = "Frontend URL"
#   value       = var.domain_name != "" ? "https://${var.domain_name}" : "https://${module.cdn.domain_name}"
# }

# =============================================================================
# Cognito - Uncomment when module is enabled
# =============================================================================
# output "cognito_user_pool_id" {
#   description = "Cognito User Pool ID"
#   value       = module.security.user_pool_id
# }
#
# output "cognito_client_id" {
#   description = "Cognito App Client ID"
#   value       = module.security.client_id
# }
