# Zedi Infrastructure - Main Configuration
# Real-time Collaboration with AWS

terraform {
  required_version = ">= 1.0.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    archive = {
      source  = "hashicorp/archive"
      version = "~> 2.0"
    }
  }
}

# AWS Provider
provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = "zedi"
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}

# Provider for CloudFront (us-east-1 required for ACM)
provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"

  default_tags {
    tags = {
      Project     = "zedi"
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}

# Data source for current AWS account
data "aws_caller_identity" "current" {}

# Data source for current region
data "aws_region" "current" {}

# Local values
locals {
  account_id = data.aws_caller_identity.current.account_id
  region     = data.aws_region.current.name

  common_tags = {
    Project     = "zedi"
    Environment = var.environment
  }
}

# =============================================================================
# Module: Networking (VPC, Subnets, VPC Endpoints)
# =============================================================================
module "networking" {
  source = "./modules/networking"

  environment         = var.environment
  vpc_cidr            = var.vpc_cidr
  availability_zones  = var.availability_zones
  enable_vpc_endpoints = var.enable_vpc_endpoints

  tags = local.common_tags
}

# =============================================================================
# Module: Cognito GitHub OAuth Proxy (Lambda + API Gateway)
# GitHub は OIDC discovery を提供しないため、プロキシで well-known / token / user を提供する。
# enable_github_idp=true のときのみ作成する。
# =============================================================================
module "cognito_github_proxy" {
  count  = var.enable_github_idp ? 1 : 0
  source = "./modules/cognito-github-proxy"

  environment         = var.environment
  github_client_id     = var.github_oauth_client_id
  github_client_secret = var.github_oauth_client_secret
  tags                 = local.common_tags
}

# =============================================================================
# Module: Security (Cognito, WAF, IAM)
# =============================================================================
module "security" {
  source = "./modules/security"

  environment   = var.environment
  callback_urls = var.cognito_callback_urls
  logout_urls   = var.cognito_logout_urls
  tags          = local.common_tags

  # Federated IdP (optional; set in .tfvars or TF_VAR_* to enable)
  google_client_id       = var.google_oauth_client_id
  google_client_secret   = var.google_oauth_client_secret
  github_client_id       = var.github_oauth_client_id
  github_client_secret   = var.github_oauth_client_secret
  enable_github_idp      = var.enable_github_idp
  github_proxy_base_url  = var.enable_github_idp ? module.cognito_github_proxy[0].invoke_url : ""

  # GitHub IdP 作成前にプロキシの Lambda/API が完全にデプロイ済みである必要がある
  depends_on = [module.cognito_github_proxy]
}

# =============================================================================
# Module: Database (Aurora Serverless v2)
# =============================================================================
module "database" {
  source = "./modules/database"

  environment        = var.environment
  vpc_id             = module.networking.vpc_id
  vpc_cidr           = var.vpc_cidr
  private_subnet_ids = module.networking.private_subnet_ids
  database_name             = var.aurora_database_name
  min_capacity              = var.aurora_min_capacity
  max_capacity              = var.aurora_max_capacity
  seconds_until_auto_pause  = var.aurora_seconds_until_auto_pause
  tags                      = local.common_tags
}

# =============================================================================
# Module: Cache (ElastiCache Redis)
# =============================================================================
module "cache" {
  source = "./modules/cache"

  environment        = var.environment
  vpc_id             = module.networking.vpc_id
  vpc_cidr           = var.vpc_cidr
  private_subnet_ids = module.networking.private_subnet_ids
  node_type          = var.redis_node_type
  num_cache_nodes    = var.redis_num_cache_nodes
  tags               = local.common_tags
}

# =============================================================================
# Module: REST API (Lambda + API Gateway HTTP API + Cognito JWT)
# C1-2: REST API 基盤
# =============================================================================
module "api" {
  source = "./modules/api"

  environment = var.environment
  tags        = local.common_tags

  cognito_user_pool_id        = module.security.user_pool_id
  cognito_user_pool_client_id = module.security.user_pool_client_id

  db_credentials_secret_arn = module.database.db_credentials_secret_arn
  aurora_cluster_arn       = module.database.cluster_arn
  aurora_database_name     = var.aurora_database_name
}

# =============================================================================
# Module: AI API (HTTP API GW + WebSocket API GW + Lambda + DynamoDB + Secrets)
# =============================================================================
module "ai_api" {
  source = "./modules/ai-api"

  environment = var.environment
  tags        = local.common_tags

  cognito_user_pool_id = module.security.user_pool_id

  db_credentials_secret_arn = module.database.db_credentials_secret_arn
  aurora_cluster_arn        = module.database.cluster_arn
  aurora_database_name      = var.aurora_database_name

  cors_origin = var.environment == "prod" ? "https://zedi-note.app" : "*"

  # Share the HTTP API Gateway for GET /api/ai/* routes
  api_id = module.api.api_id
}

# =============================================================================
# Module: Realtime (ECS Fargate Spot, ALB, Hocuspocus)
# =============================================================================
module "realtime" {
  source = "./modules/realtime"

  environment        = var.environment
  vpc_id             = module.networking.vpc_id
  public_subnet_ids  = module.networking.public_subnet_ids
  private_subnet_ids = module.networking.private_subnet_ids
  tags               = local.common_tags

  # ECS Configuration
  task_cpu         = var.ecs_task_cpu
  task_memory      = var.ecs_task_memory
  desired_count    = var.ecs_desired_count
  use_fargate_spot = var.use_fargate_spot

  # IAM Roles
  ecs_execution_role_arn = module.security.ecs_execution_role_arn
  ecs_task_role_arn      = module.security.ecs_task_role_arn

  # Dependencies
  redis_connection_string   = module.cache.redis_connection_string
  db_credentials_secret_arn = module.database.db_credentials_secret_arn
  cognito_user_pool_id      = module.security.user_pool_id

  # SSL/TLS (empty for dev, ACM ARN for prod)
  acm_certificate_arn = var.acm_certificate_arn

  # Auto Scaling
  enable_autoscaling = var.enable_ecs_autoscaling
  min_capacity       = var.ecs_min_capacity
  max_capacity       = var.ecs_max_capacity

  # Monitoring
  enable_container_insights = var.enable_detailed_monitoring
}

# =============================================================================
# Module: Subscription (LemonSqueezy Webhook)
# =============================================================================
module "subscription" {
  source = "./modules/subscription"

  environment = var.environment
  tags        = local.common_tags

  db_credentials_secret_arn = module.database.db_credentials_secret_arn
  aurora_cluster_arn        = module.database.cluster_arn
  aurora_database_name      = var.aurora_database_name

  api_id = module.api.api_id
}

# =============================================================================
# Module: CDN (CloudFront, S3)
# =============================================================================
module "cdn" {
  source = "./modules/cdn"

  environment           = var.environment
  domain_name           = var.domain_name
  route53_zone_id       = var.route53_zone_id
  create_route53_zone   = var.create_route53_zone
  attach_custom_domain  = var.cdn_attach_custom_domain
  tags                  = local.common_tags

  providers = {
    aws.us_east_1 = aws.us_east_1
  }
}

# =============================================================================
# Module: Monitoring (CloudWatch)
# =============================================================================
# module "monitoring" {
#   source = "./modules/monitoring"
#
#   environment = var.environment
#   tags        = local.common_tags
# }
