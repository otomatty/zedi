# Zedi Infrastructure - Main Configuration
# Real-time Collaboration with AWS

terraform {
  required_version = ">= 1.0.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
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
# Module: Security (Cognito, WAF, IAM)
# =============================================================================
module "security" {
  source = "./modules/security"

  environment   = var.environment
  callback_urls = var.cognito_callback_urls
  logout_urls   = var.cognito_logout_urls
  tags          = local.common_tags
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
  database_name      = var.aurora_database_name
  min_capacity       = var.aurora_min_capacity
  max_capacity       = var.aurora_max_capacity
  tags               = local.common_tags
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
# Module: Realtime (ECS Fargate Spot, ALB, Hocuspocus)
# =============================================================================
# module "realtime" {
#   source = "./modules/realtime"
#
#   environment        = var.environment
#   vpc_id             = module.networking.vpc_id
#   public_subnet_ids  = module.networking.public_subnet_ids
#   private_subnet_ids = module.networking.private_subnet_ids
#   tags               = local.common_tags
# }

# =============================================================================
# Module: CDN (CloudFront, S3)
# =============================================================================
# module "cdn" {
#   source = "./modules/cdn"
#
#   environment = var.environment
#   tags        = local.common_tags
#
#   providers = {
#     aws.us_east_1 = aws.us_east_1
#   }
# }

# =============================================================================
# Module: Monitoring (CloudWatch)
# =============================================================================
# module "monitoring" {
#   source = "./modules/monitoring"
#
#   environment = var.environment
#   tags        = local.common_tags
# }
