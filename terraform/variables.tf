# Zedi Infrastructure - Variables

# =============================================================================
# General
# =============================================================================
variable "environment" {
  description = "Environment name (dev, staging, prod)"
  type        = string
  default     = "dev"

  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "Environment must be one of: dev, staging, prod."
  }
}

variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "ap-northeast-1"
}

# =============================================================================
# Networking
# =============================================================================
variable "vpc_cidr" {
  description = "CIDR block for VPC"
  type        = string
  default     = "10.0.0.0/16"
}

variable "availability_zones" {
  description = "List of availability zones"
  type        = list(string)
  default     = ["ap-northeast-1a", "ap-northeast-1c"]
}

variable "enable_vpc_endpoints" {
  description = "Enable VPC Endpoints (cost optimization: replaces NAT Gateway)"
  type        = bool
  default     = true
}

# =============================================================================
# Database (Aurora)
# =============================================================================
variable "aurora_min_capacity" {
  description = "Minimum ACU for Aurora Serverless v2"
  type        = number
  default     = 0.5
}

variable "aurora_max_capacity" {
  description = "Maximum ACU for Aurora Serverless v2"
  type        = number
  default     = 4
}

variable "aurora_seconds_until_auto_pause" {
  description = "Seconds of inactivity before auto-pause when aurora_min_capacity=0 (300-86400). Set only for dev; leave null for prod."
  type        = number
  default     = null
}

variable "aurora_database_name" {
  description = "Database name"
  type        = string
  default     = "zedi"
}

# =============================================================================
# Cache (ElastiCache Redis)
# =============================================================================
variable "redis_node_type" {
  description = "ElastiCache Redis node type"
  type        = string
  default     = "cache.t4g.micro"
}

variable "redis_num_cache_nodes" {
  description = "Number of cache nodes"
  type        = number
  default     = 1
}

# =============================================================================
# ECS (Fargate)
# =============================================================================
variable "use_fargate_spot" {
  description = "Use Fargate Spot for cost savings (~70% discount)"
  type        = bool
  default     = true
}

variable "ecs_task_cpu" {
  description = "CPU units for ECS task (256, 512, 1024, 2048, 4096)"
  type        = number
  default     = 256
}

variable "ecs_task_memory" {
  description = "Memory (MB) for ECS task"
  type        = number
  default     = 512
}

variable "ecs_desired_count" {
  description = "Desired number of ECS tasks"
  type        = number
  default     = 1
}

variable "enable_ecs_autoscaling" {
  description = "Enable ECS service auto scaling"
  type        = bool
  default     = false
}

variable "ecs_min_capacity" {
  description = "Minimum number of ECS tasks (when autoscaling enabled)"
  type        = number
  default     = 1
}

variable "ecs_max_capacity" {
  description = "Maximum number of ECS tasks (when autoscaling enabled)"
  type        = number
  default     = 4
}

variable "acm_certificate_arn" {
  description = "ACM certificate ARN for HTTPS (optional, if empty uses HTTP)"
  type        = string
  default     = ""
}

# =============================================================================
# Security (Cognito)
# =============================================================================
variable "cognito_callback_urls" {
  description = "List of allowed callback URLs for Cognito OAuth"
  type        = list(string)
  default     = ["http://localhost:30000/callback"]
}

variable "cognito_logout_urls" {
  description = "List of allowed logout URLs for Cognito"
  type        = list(string)
  default     = ["http://localhost:30000"]
}

variable "google_oauth_client_id" {
  description = "Google OAuth Client ID for Cognito federated sign-in"
  type        = string
  default     = ""
}

variable "google_oauth_client_secret" {
  description = "Google OAuth Client Secret"
  type        = string
  default     = ""
  sensitive   = true
}

variable "github_oauth_client_id" {
  description = "GitHub OAuth App Client ID for Cognito"
  type        = string
  default     = ""
}

variable "github_oauth_client_secret" {
  description = "GitHub OAuth App Client Secret"
  type        = string
  default     = ""
  sensitive   = true
}

# GitHub は OIDC discovery がないため、プロキシ API を用意するまで false 推奨
variable "enable_github_idp" {
  description = "Create GitHub as Cognito IdP (requires token/user proxy; default false)"
  type        = bool
  default     = false
}

# =============================================================================
# Domain (Optional)
# =============================================================================
variable "domain_name" {
  description = "Custom domain name (optional)"
  type        = string
  default     = ""
}

variable "create_route53_zone" {
  description = "Create Route53 hosted zone for domain"
  type        = bool
  default     = false
}

variable "route53_zone_id" {
  description = "Route53 hosted zone ID for frontend domain. Empty when DNS is managed elsewhere (e.g. Cloudflare)"
  type        = string
  default     = ""
}

variable "cdn_attach_custom_domain" {
  description = "Attach custom domain and ACM cert to CloudFront. Set to true after ACM cert is validated (e.g. after adding CNAME in Cloudflare)"
  type        = bool
  default     = false
}

# =============================================================================
# Monitoring
# =============================================================================
variable "alarm_email" {
  description = "Email address for CloudWatch alarms"
  type        = string
  default     = ""
}

variable "enable_detailed_monitoring" {
  description = "Enable detailed CloudWatch monitoring"
  type        = bool
  default     = false
}
