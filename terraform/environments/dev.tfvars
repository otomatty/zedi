# Development Environment Configuration
# Optimized for cost (~$76/month)

environment = "dev"
aws_region  = "ap-northeast-1"

# Networking
vpc_cidr             = "10.0.0.0/16"
availability_zones   = ["ap-northeast-1a"]  # Single AZ for cost savings
enable_vpc_endpoints = true                  # Replaces NAT Gateway ($32 → $14)

# Database (Aurora Serverless v2)
aurora_min_capacity  = 0.5   # Minimum ACU (scales to zero when idle)
aurora_max_capacity  = 4     # Maximum ACU
aurora_database_name = "zedi"

# Cache (ElastiCache Redis)
redis_node_type       = "cache.t4g.micro"  # Graviton2, smallest instance
redis_num_cache_nodes = 1

# ECS (Fargate Spot)
use_fargate_spot  = true   # ~70% cost savings
ecs_task_cpu      = 256    # 0.25 vCPU
ecs_task_memory   = 512    # 512 MB
ecs_desired_count = 1      # Single instance for dev

# Domain (optional)
domain_name         = ""
create_route53_zone = false

# Monitoring
alarm_email                = ""
enable_detailed_monitoring = false
