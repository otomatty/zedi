# Production Environment Configuration
# Optimized for cost with basic redundancy (~$76/month for small scale)

environment = "prod"
aws_region  = "ap-northeast-1"

# Networking
vpc_cidr             = "10.0.0.0/16"
availability_zones   = ["ap-northeast-1a", "ap-northeast-1c"]  # 2 AZs for redundancy
enable_vpc_endpoints = true                                     # Replaces NAT Gateway

# Database (Aurora Serverless v2)
aurora_min_capacity  = 0.5   # Minimum ACU
aurora_max_capacity  = 8     # Higher max for production spikes
aurora_database_name = "zedi"

# Cache (ElastiCache Redis)
redis_node_type       = "cache.t4g.micro"  # Graviton2
redis_num_cache_nodes = 1                   # Single node (upgrade to 2 for HA)

# Security (Cognito) - OAuth callback and logout URLs (zedi-note.app + www)
cognito_callback_urls = ["https://zedi-note.app/auth/callback", "https://www.zedi-note.app/auth/callback"]
cognito_logout_urls   = ["https://zedi-note.app", "https://www.zedi-note.app"]

# Federated IdP (本番) - Client ID のみ。シークレットは prod.secret.env で TF_VAR_* として渡す
# 設定手順: docs/plans/20260208/prod-idp-google-github-work-plan.md
google_oauth_client_id  = "18191904440-f37rv8s87inkdk9glhe3drhlstp1qfbq.apps.googleusercontent.com"  # GCP 本番用 OAuth クライアント ID（xxxxx.apps.googleusercontent.com）
github_oauth_client_id  = "Ov23liF54sgTIvaXhVDV"  # GitHub 本番用 OAuth アプリの Client ID
enable_github_idp       = true

# ECS (Fargate Spot)
use_fargate_spot  = true   # ~70% cost savings (with on-demand fallback)
ecs_task_cpu      = 512    # 0.5 vCPU
ecs_task_memory   = 1024   # 1 GB
ecs_desired_count = 2      # 2 instances for availability

# Domain (Cloudflare で管理。Route53 は使わない)
domain_name         = "zedi-note.app"
create_route53_zone = false
route53_zone_id     = ""
# Cloudflare で ACM 検証用 CNAME を追加し証明書が「発行済み」になったら true にする
cdn_attach_custom_domain = true

# Monitoring
alarm_email                = ""     # Set email for alerts
enable_detailed_monitoring = true
