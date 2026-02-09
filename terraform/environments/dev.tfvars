# Development Environment Configuration
# Optimized for cost (~$76/month)

environment = "dev"
aws_region  = "ap-northeast-1"

# Networking
vpc_cidr             = "10.0.0.0/16"
availability_zones   = ["ap-northeast-1a", "ap-northeast-1c"]  # Aurora requires 2 AZs minimum
enable_vpc_endpoints = true                  # Replaces NAT Gateway ($32 → $14)

# Database (Aurora Serverless v2) - scale-to-zero for dev cost savings
aurora_min_capacity             = 0     # 0 = scale to zero with auto-pause
aurora_max_capacity              = 4     # Maximum ACU when active
aurora_seconds_until_auto_pause   = 600   # Pause after 10 min idle (300-86400)
aurora_database_name             = "zedi"

# Cache (ElastiCache Redis)
redis_node_type       = "cache.t4g.micro"  # Graviton2, smallest instance
redis_num_cache_nodes = 1

# Security (Cognito) - OAuth callback and logout URLs
cognito_callback_urls = ["http://localhost:30000/auth/callback"]
cognito_logout_urls   = ["http://localhost:30000"]

# Federated IdP (Google / GitHub) - Client ID はここに記載。シークレットは環境変数で渡す（下記参照）
# 設定手順: docs/guides/cognito-google-github-idp-setup.md
google_oauth_client_id = "18191904440-asgu6seo9b9v68hs5mirklfv2msmir5d.apps.googleusercontent.com"
github_oauth_client_id = "Ov23liz1wBIxySSlVUJU"
# シークレットは dev.tfvars に書かず、terraform/environments/dev.secret.env で渡す（要作成。.gitignore 済み）
# GitHub IdP を有効にする（プロキシ API を Terraform でデプロイする）
enable_github_idp = true

# ECS (Fargate Spot)
use_fargate_spot       = true   # ~70% cost savings
ecs_task_cpu           = 256    # 0.25 vCPU
ecs_task_memory        = 512    # 512 MB
ecs_desired_count      = 1      # Single instance for dev
enable_ecs_autoscaling = false  # No autoscaling for dev
ecs_min_capacity       = 1
ecs_max_capacity       = 4
acm_certificate_arn    = ""     # No HTTPS for dev (uses HTTP)

# Domain (optional)
domain_name         = ""
create_route53_zone = false

# Monitoring
alarm_email                = ""
enable_detailed_monitoring = false
