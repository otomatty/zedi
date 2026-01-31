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

# ECS (Fargate Spot)
use_fargate_spot  = true   # ~70% cost savings (with on-demand fallback)
ecs_task_cpu      = 512    # 0.5 vCPU
ecs_task_memory   = 1024   # 1 GB
ecs_desired_count = 2      # 2 instances for availability

# Domain (optional - set your domain)
domain_name         = ""    # e.g., "zedi.example.com"
create_route53_zone = false

# Monitoring
alarm_email                = ""     # Set email for alerts
enable_detailed_monitoring = true
