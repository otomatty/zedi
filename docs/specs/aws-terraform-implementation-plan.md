# AWS Terraform 実装計画書

**Document Version:** 1.0  
**Created:** 2026-01-31  
**Status:** Draft  

---

## 1. 概要

本ドキュメントでは、Zediのリアルタイム同時編集機能を実現するためのAWSインフラ構築計画を定義する。すべてのインフラはTerraformで管理し、Infrastructure as Code (IaC) を徹底する。

---

## 2. Terraform プロジェクト構成

```
terraform/
├── README.md
├── .gitignore
├── .terraform.lock.hcl
│
├── environments/
│   ├── dev/
│   │   ├── main.tf
│   │   ├── variables.tf
│   │   ├── outputs.tf
│   │   ├── terraform.tfvars
│   │   └── backend.tf
│   │
│   ├── staging/
│   │   ├── main.tf
│   │   ├── variables.tf
│   │   ├── outputs.tf
│   │   ├── terraform.tfvars
│   │   └── backend.tf
│   │
│   └── prod/
│       ├── main.tf
│       ├── variables.tf
│       ├── outputs.tf
│       ├── terraform.tfvars
│       └── backend.tf
│
├── modules/
│   ├── networking/
│   │   ├── main.tf
│   │   ├── variables.tf
│   │   ├── outputs.tf
│   │   └── README.md
│   │
│   ├── database/
│   │   ├── main.tf           # Aurora PostgreSQL
│   │   ├── variables.tf
│   │   ├── outputs.tf
│   │   └── README.md
│   │
│   ├── cache/
│   │   ├── main.tf           # ElastiCache Redis
│   │   ├── variables.tf
│   │   ├── outputs.tf
│   │   └── README.md
│   │
│   ├── realtime/
│   │   ├── main.tf           # ECS Fargate + ALB
│   │   ├── ecs.tf
│   │   ├── alb.tf
│   │   ├── autoscaling.tf
│   │   ├── variables.tf
│   │   ├── outputs.tf
│   │   └── README.md
│   │
│   ├── api/
│   │   ├── main.tf           # API Gateway + Lambda
│   │   ├── lambda.tf
│   │   ├── variables.tf
│   │   ├── outputs.tf
│   │   └── README.md
│   │
│   ├── auth/
│   │   ├── main.tf           # Cognito
│   │   ├── variables.tf
│   │   ├── outputs.tf
│   │   └── README.md
│   │
│   ├── cdn/
│   │   ├── main.tf           # CloudFront + S3
│   │   ├── s3.tf
│   │   ├── variables.tf
│   │   ├── outputs.tf
│   │   └── README.md
│   │
│   ├── monitoring/
│   │   ├── main.tf           # CloudWatch
│   │   ├── alarms.tf
│   │   ├── dashboards.tf
│   │   ├── variables.tf
│   │   ├── outputs.tf
│   │   └── README.md
│   │
│   └── security/
│       ├── main.tf           # WAF, Security Groups
│       ├── waf.tf
│       ├── security_groups.tf
│       ├── secrets.tf
│       ├── variables.tf
│       ├── outputs.tf
│       └── README.md
│
└── shared/
    ├── backend.tf            # S3 + DynamoDB for state
    ├── providers.tf
    └── versions.tf
```

---

## 3. モジュール詳細設計

### 3.1 Networking モジュール

```hcl
# modules/networking/main.tf

################################################################################
# VPC
################################################################################

resource "aws_vpc" "main" {
  cidr_block           = var.vpc_cidr
  enable_dns_hostnames = true
  enable_dns_support   = true

  tags = {
    Name        = "${var.project}-${var.environment}-vpc"
    Environment = var.environment
    Project     = var.project
  }
}

################################################################################
# Internet Gateway
################################################################################

resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id

  tags = {
    Name        = "${var.project}-${var.environment}-igw"
    Environment = var.environment
  }
}

################################################################################
# Public Subnets (Multi-AZ)
################################################################################

resource "aws_subnet" "public" {
  count                   = length(var.availability_zones)
  vpc_id                  = aws_vpc.main.id
  cidr_block              = cidrsubnet(var.vpc_cidr, 4, count.index)
  availability_zone       = var.availability_zones[count.index]
  map_public_ip_on_launch = true

  tags = {
    Name        = "${var.project}-${var.environment}-public-${var.availability_zones[count.index]}"
    Environment = var.environment
    Type        = "public"
  }
}

################################################################################
# Private Subnets (Multi-AZ)
################################################################################

resource "aws_subnet" "private" {
  count             = length(var.availability_zones)
  vpc_id            = aws_vpc.main.id
  cidr_block        = cidrsubnet(var.vpc_cidr, 4, count.index + length(var.availability_zones))
  availability_zone = var.availability_zones[count.index]

  tags = {
    Name        = "${var.project}-${var.environment}-private-${var.availability_zones[count.index]}"
    Environment = var.environment
    Type        = "private"
  }
}

################################################################################
# Database Subnets (Multi-AZ)
################################################################################

resource "aws_subnet" "database" {
  count             = length(var.availability_zones)
  vpc_id            = aws_vpc.main.id
  cidr_block        = cidrsubnet(var.vpc_cidr, 4, count.index + 2 * length(var.availability_zones))
  availability_zone = var.availability_zones[count.index]

  tags = {
    Name        = "${var.project}-${var.environment}-database-${var.availability_zones[count.index]}"
    Environment = var.environment
    Type        = "database"
  }
}

################################################################################
# VPC Endpoints (コスト最適化: NAT Gateway代替)
# NAT Gatewayは$32/月以上かかるため、VPC Endpointで代替
################################################################################

# ECR API Endpoint (Fargate用)
resource "aws_vpc_endpoint" "ecr_api" {
  vpc_id              = aws_vpc.main.id
  service_name        = "com.amazonaws.${var.aws_region}.ecr.api"
  vpc_endpoint_type   = "Interface"
  subnet_ids          = aws_subnet.private[*].id
  security_group_ids  = [aws_security_group.vpc_endpoints.id]
  private_dns_enabled = true

  tags = {
    Name        = "${var.project}-${var.environment}-ecr-api-endpoint"
    Environment = var.environment
  }
}

# ECR DKR Endpoint (Fargate用)
resource "aws_vpc_endpoint" "ecr_dkr" {
  vpc_id              = aws_vpc.main.id
  service_name        = "com.amazonaws.${var.aws_region}.ecr.dkr"
  vpc_endpoint_type   = "Interface"
  subnet_ids          = aws_subnet.private[*].id
  security_group_ids  = [aws_security_group.vpc_endpoints.id]
  private_dns_enabled = true

  tags = {
    Name        = "${var.project}-${var.environment}-ecr-dkr-endpoint"
    Environment = var.environment
  }
}

# CloudWatch Logs Endpoint
resource "aws_vpc_endpoint" "logs" {
  vpc_id              = aws_vpc.main.id
  service_name        = "com.amazonaws.${var.aws_region}.logs"
  vpc_endpoint_type   = "Interface"
  subnet_ids          = aws_subnet.private[*].id
  security_group_ids  = [aws_security_group.vpc_endpoints.id]
  private_dns_enabled = true

  tags = {
    Name        = "${var.project}-${var.environment}-logs-endpoint"
    Environment = var.environment
  }
}

# Secrets Manager Endpoint
resource "aws_vpc_endpoint" "secretsmanager" {
  vpc_id              = aws_vpc.main.id
  service_name        = "com.amazonaws.${var.aws_region}.secretsmanager"
  vpc_endpoint_type   = "Interface"
  subnet_ids          = aws_subnet.private[*].id
  security_group_ids  = [aws_security_group.vpc_endpoints.id]
  private_dns_enabled = true

  tags = {
    Name        = "${var.project}-${var.environment}-secretsmanager-endpoint"
    Environment = var.environment
  }
}

# VPC Endpoint Security Group
resource "aws_security_group" "vpc_endpoints" {
  name        = "${var.project}-${var.environment}-vpc-endpoints-sg"
  description = "Security group for VPC Endpoints"
  vpc_id      = aws_vpc.main.id

  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = [var.vpc_cidr]
  }

  tags = {
    Name        = "${var.project}-${var.environment}-vpc-endpoints-sg"
    Environment = var.environment
  }
}

################################################################################
# Route Tables
################################################################################

# Public Route Table
resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.main.id
  }

  tags = {
    Name        = "${var.project}-${var.environment}-public-rt"
    Environment = var.environment
  }
}

resource "aws_route_table_association" "public" {
  count          = length(aws_subnet.public)
  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

# Private Route Tables (One per AZ)
# VPC Endpointを使用するため、インターネットへのルートは不要
resource "aws_route_table" "private" {
  count  = length(var.availability_zones)
  vpc_id = aws_vpc.main.id

  # VPC Endpoint経由でAWSサービスにアクセスするため
  # NAT Gatewayへのルートは不要（コスト最適化）

  tags = {
    Name        = "${var.project}-${var.environment}-private-rt-${count.index + 1}"
    Environment = var.environment
  }
}

resource "aws_route_table_association" "private" {
  count          = length(aws_subnet.private)
  subnet_id      = aws_subnet.private[count.index].id
  route_table_id = aws_route_table.private[count.index].id
}

resource "aws_route_table_association" "database" {
  count          = length(aws_subnet.database)
  subnet_id      = aws_subnet.database[count.index].id
  route_table_id = aws_route_table.private[count.index].id
}

################################################################################
# VPC Endpoints (Cost Optimization)
################################################################################

# S3 Gateway Endpoint (Free)
resource "aws_vpc_endpoint" "s3" {
  vpc_id            = aws_vpc.main.id
  service_name      = "com.amazonaws.${var.aws_region}.s3"
  vpc_endpoint_type = "Gateway"
  route_table_ids   = concat(
    [aws_route_table.public.id],
    aws_route_table.private[*].id
  )

  tags = {
    Name        = "${var.project}-${var.environment}-s3-endpoint"
    Environment = var.environment
  }
}

# DynamoDB Gateway Endpoint (Free)
resource "aws_vpc_endpoint" "dynamodb" {
  vpc_id            = aws_vpc.main.id
  service_name      = "com.amazonaws.${var.aws_region}.dynamodb"
  vpc_endpoint_type = "Gateway"
  route_table_ids   = concat(
    [aws_route_table.public.id],
    aws_route_table.private[*].id
  )

  tags = {
    Name        = "${var.project}-${var.environment}-dynamodb-endpoint"
    Environment = var.environment
  }
}
```

```hcl
# modules/networking/variables.tf

variable "project" {
  description = "Project name"
  type        = string
}

variable "environment" {
  description = "Environment name"
  type        = string
}

variable "aws_region" {
  description = "AWS region"
  type        = string
}

variable "vpc_cidr" {
  description = "CIDR block for VPC"
  type        = string
  default     = "10.0.0.0/16"
}

variable "availability_zones" {
  description = "List of availability zones"
  type        = list(string)
}

variable "enable_nat_gateway" {
  description = "Enable NAT Gateway for private subnets"
  type        = bool
  default     = true
}
```

```hcl
# modules/networking/outputs.tf

output "vpc_id" {
  description = "VPC ID"
  value       = aws_vpc.main.id
}

output "vpc_cidr" {
  description = "VPC CIDR block"
  value       = aws_vpc.main.cidr_block
}

output "public_subnet_ids" {
  description = "Public subnet IDs"
  value       = aws_subnet.public[*].id
}

output "private_subnet_ids" {
  description = "Private subnet IDs"
  value       = aws_subnet.private[*].id
}

output "database_subnet_ids" {
  description = "Database subnet IDs"
  value       = aws_subnet.database[*].id
}

output "nat_gateway_ips" {
  description = "NAT Gateway public IPs"
  value       = aws_eip.nat[*].public_ip
}
```

### 3.2 Database モジュール (Aurora PostgreSQL)

```hcl
# modules/database/main.tf

################################################################################
# DB Subnet Group
################################################################################

resource "aws_db_subnet_group" "main" {
  name        = "${var.project}-${var.environment}-db-subnet"
  description = "Database subnet group for ${var.project}"
  subnet_ids  = var.database_subnet_ids

  tags = {
    Name        = "${var.project}-${var.environment}-db-subnet"
    Environment = var.environment
  }
}

################################################################################
# Aurora Cluster Parameter Group
################################################################################

resource "aws_rds_cluster_parameter_group" "main" {
  name        = "${var.project}-${var.environment}-cluster-pg"
  family      = "aurora-postgresql15"
  description = "Aurora PostgreSQL cluster parameter group"

  parameter {
    name  = "log_statement"
    value = "all"
  }

  parameter {
    name  = "log_min_duration_statement"
    value = "1000"  # 1秒以上のクエリをログ
  }

  tags = {
    Name        = "${var.project}-${var.environment}-cluster-pg"
    Environment = var.environment
  }
}

################################################################################
# Aurora DB Parameter Group
################################################################################

resource "aws_db_parameter_group" "main" {
  name        = "${var.project}-${var.environment}-db-pg"
  family      = "aurora-postgresql15"
  description = "Aurora PostgreSQL instance parameter group"

  parameter {
    name  = "shared_preload_libraries"
    value = "pg_stat_statements"
  }

  tags = {
    Name        = "${var.project}-${var.environment}-db-pg"
    Environment = var.environment
  }
}

################################################################################
# Aurora Serverless v2 Cluster
################################################################################

resource "aws_rds_cluster" "main" {
  cluster_identifier     = "${var.project}-${var.environment}-cluster"
  engine                 = "aurora-postgresql"
  engine_mode            = "provisioned"
  engine_version         = "15.4"
  database_name          = var.database_name
  master_username        = var.master_username
  master_password        = var.master_password
  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [var.database_security_group_id]

  db_cluster_parameter_group_name = aws_rds_cluster_parameter_group.main.name

  # Serverless v2 設定
  serverlessv2_scaling_configuration {
    min_capacity = var.min_capacity
    max_capacity = var.max_capacity
  }

  # バックアップ設定
  backup_retention_period = var.backup_retention_period
  preferred_backup_window = "03:00-04:00"

  # メンテナンス設定
  preferred_maintenance_window = "sun:04:00-sun:05:00"

  # 暗号化
  storage_encrypted = true
  kms_key_id        = var.kms_key_arn

  # 削除保護
  deletion_protection = var.environment == "prod" ? true : false

  # 高速フェイルオーバー
  enable_http_endpoint = true

  # スナップショット設定
  skip_final_snapshot       = var.environment != "prod"
  final_snapshot_identifier = var.environment == "prod" ? "${var.project}-${var.environment}-final-snapshot" : null

  tags = {
    Name        = "${var.project}-${var.environment}-cluster"
    Environment = var.environment
  }
}

################################################################################
# Aurora Serverless v2 Instances
################################################################################

resource "aws_rds_cluster_instance" "main" {
  count                = var.instance_count
  identifier           = "${var.project}-${var.environment}-instance-${count.index + 1}"
  cluster_identifier   = aws_rds_cluster.main.id
  instance_class       = "db.serverless"
  engine               = aws_rds_cluster.main.engine
  engine_version       = aws_rds_cluster.main.engine_version
  db_parameter_group_name = aws_db_parameter_group.main.name

  # Performance Insights
  performance_insights_enabled = true
  performance_insights_retention_period = 7

  # 監視
  monitoring_interval = 60
  monitoring_role_arn = var.monitoring_role_arn

  tags = {
    Name        = "${var.project}-${var.environment}-instance-${count.index + 1}"
    Environment = var.environment
  }
}
```

### 3.3 Cache モジュール (ElastiCache Redis)

```hcl
# modules/cache/main.tf

################################################################################
# ElastiCache Subnet Group
################################################################################

resource "aws_elasticache_subnet_group" "main" {
  name        = "${var.project}-${var.environment}-redis-subnet"
  description = "Redis subnet group"
  subnet_ids  = var.private_subnet_ids

  tags = {
    Name        = "${var.project}-${var.environment}-redis-subnet"
    Environment = var.environment
  }
}

################################################################################
# ElastiCache Parameter Group
################################################################################

resource "aws_elasticache_parameter_group" "main" {
  name   = "${var.project}-${var.environment}-redis-params"
  family = "redis7"

  # Pub/Sub最適化
  parameter {
    name  = "notify-keyspace-events"
    value = "Ex"  # Expired events
  }

  parameter {
    name  = "maxmemory-policy"
    value = "volatile-lru"
  }

  tags = {
    Name        = "${var.project}-${var.environment}-redis-params"
    Environment = var.environment
  }
}

################################################################################
# ElastiCache Replication Group (Multi-AZ)
################################################################################

resource "aws_elasticache_replication_group" "main" {
  replication_group_id = "${var.project}-${var.environment}-redis"
  description          = "Redis cluster for realtime collaboration"

  # エンジン設定
  engine               = "redis"
  engine_version       = "7.0"
  node_type            = var.node_type
  port                 = 6379

  # クラスター設定
  num_cache_clusters         = var.num_cache_clusters
  automatic_failover_enabled = var.num_cache_clusters > 1

  # ネットワーク設定
  subnet_group_name  = aws_elasticache_subnet_group.main.name
  security_group_ids = [var.redis_security_group_id]

  # パラメータ
  parameter_group_name = aws_elasticache_parameter_group.main.name

  # 暗号化
  at_rest_encryption_enabled = true
  transit_encryption_enabled = true
  auth_token                 = var.auth_token

  # メンテナンス
  maintenance_window       = "sun:05:00-sun:06:00"
  snapshot_window          = "04:00-05:00"
  snapshot_retention_limit = var.snapshot_retention_limit

  # 自動マイナーバージョンアップグレード
  auto_minor_version_upgrade = true

  tags = {
    Name        = "${var.project}-${var.environment}-redis"
    Environment = var.environment
  }
}
```

### 3.4 Realtime モジュール (ECS Fargate + ALB)

```hcl
# modules/realtime/main.tf

################################################################################
# ECS Cluster
################################################################################

resource "aws_ecs_cluster" "main" {
  name = "${var.project}-${var.environment}-realtime"

  setting {
    name  = "containerInsights"
    value = "enabled"
  }

  configuration {
    execute_command_configuration {
      logging = "OVERRIDE"

      log_configuration {
        cloud_watch_log_group_name = aws_cloudwatch_log_group.ecs.name
      }
    }
  }

  tags = {
    Name        = "${var.project}-${var.environment}-realtime"
    Environment = var.environment
  }
}

resource "aws_ecs_cluster_capacity_providers" "main" {
  cluster_name = aws_ecs_cluster.main.name

  capacity_providers = ["FARGATE", "FARGATE_SPOT"]

  default_capacity_provider_strategy {
    base              = 1
    weight            = 100
    capacity_provider = "FARGATE"
  }
}

################################################################################
# CloudWatch Log Group
################################################################################

resource "aws_cloudwatch_log_group" "ecs" {
  name              = "/ecs/${var.project}-${var.environment}-hocuspocus"
  retention_in_days = var.log_retention_days

  tags = {
    Name        = "${var.project}-${var.environment}-hocuspocus-logs"
    Environment = var.environment
  }
}

################################################################################
# ECS Task Definition
################################################################################

resource "aws_ecs_task_definition" "hocuspocus" {
  family                   = "${var.project}-${var.environment}-hocuspocus"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = var.task_cpu
  memory                   = var.task_memory
  execution_role_arn       = var.ecs_execution_role_arn
  task_role_arn            = var.ecs_task_role_arn

  container_definitions = jsonencode([
    {
      name  = "hocuspocus"
      image = var.hocuspocus_image

      portMappings = [
        {
          containerPort = 3000
          hostPort      = 3000
          protocol      = "tcp"
        }
      ]

      environment = [
        {
          name  = "NODE_ENV"
          value = var.environment
        },
        {
          name  = "PORT"
          value = "3000"
        },
        {
          name  = "REDIS_HOST"
          value = var.redis_endpoint
        },
        {
          name  = "REDIS_PORT"
          value = "6379"
        },
        {
          name  = "DATABASE_URL"
          value = var.database_url
        },
        {
          name  = "AWS_REGION"
          value = var.aws_region
        },
        {
          name  = "S3_BUCKET"
          value = var.s3_bucket_name
        }
      ]

      secrets = [
        {
          name      = "REDIS_PASSWORD"
          valueFrom = var.redis_password_secret_arn
        },
        {
          name      = "JWT_SECRET"
          valueFrom = var.jwt_secret_arn
        }
      ]

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.ecs.name
          "awslogs-region"        = var.aws_region
          "awslogs-stream-prefix" = "hocuspocus"
        }
      }

      healthCheck = {
        command     = ["CMD-SHELL", "curl -f http://localhost:3000/health || exit 1"]
        interval    = 30
        timeout     = 5
        retries     = 3
        startPeriod = 60
      }
    }
  ])

  tags = {
    Name        = "${var.project}-${var.environment}-hocuspocus"
    Environment = var.environment
  }
}

################################################################################
# ECS Service (Fargate Spot でコスト最適化)
################################################################################

resource "aws_ecs_service" "hocuspocus" {
  name                               = "hocuspocus"
  cluster                            = aws_ecs_cluster.main.id
  task_definition                    = aws_ecs_task_definition.hocuspocus.arn
  desired_count                      = var.desired_count
  deployment_minimum_healthy_percent = 50
  deployment_maximum_percent         = 200
  platform_version                   = "LATEST"
  health_check_grace_period_seconds  = 60

  # Fargate Spot でコスト削減 (約70%オフ)
  capacity_provider_strategy {
    capacity_provider = var.use_fargate_spot ? "FARGATE_SPOT" : "FARGATE"
    weight            = 100
    base              = var.use_fargate_spot ? 0 : 1
  }

  # Spotが使えない場合のフォールバック
  dynamic "capacity_provider_strategy" {
    for_each = var.use_fargate_spot ? [1] : []
    content {
      capacity_provider = "FARGATE"
      weight            = 1
      base              = 1  # 最低1タスクは通常Fargateで確保
    }
  }

  network_configuration {
    subnets          = var.private_subnet_ids
    security_groups  = [var.ecs_security_group_id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.hocuspocus.arn
    container_name   = "hocuspocus"
    container_port   = 3000
  }

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  tags = {
    Name        = "${var.project}-${var.environment}-hocuspocus-service"
    Environment = var.environment
  }

  depends_on = [aws_lb_listener.https]
}
```

```hcl
# modules/realtime/alb.tf

################################################################################
# Application Load Balancer
################################################################################

resource "aws_lb" "main" {
  name               = "${var.project}-${var.environment}-realtime-alb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [var.alb_security_group_id]
  subnets            = var.public_subnet_ids

  # WebSocket用のアイドルタイムアウト延長
  idle_timeout = 3600  # 1時間

  enable_deletion_protection = var.environment == "prod"

  tags = {
    Name        = "${var.project}-${var.environment}-realtime-alb"
    Environment = var.environment
  }
}

################################################################################
# Target Group
################################################################################

resource "aws_lb_target_group" "hocuspocus" {
  name        = "${var.project}-${var.environment}-hocuspocus-tg"
  port        = 3000
  protocol    = "HTTP"
  vpc_id      = var.vpc_id
  target_type = "ip"

  # スティッキーセッション（WebSocket用）
  stickiness {
    type            = "lb_cookie"
    cookie_duration = 86400  # 24時間
    enabled         = true
  }

  health_check {
    enabled             = true
    path                = "/health"
    port                = "traffic-port"
    healthy_threshold   = 2
    unhealthy_threshold = 3
    timeout             = 5
    interval            = 30
    matcher             = "200"
  }

  tags = {
    Name        = "${var.project}-${var.environment}-hocuspocus-tg"
    Environment = var.environment
  }
}

################################################################################
# Listeners
################################################################################

# HTTP -> HTTPS Redirect
resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.main.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type = "redirect"

    redirect {
      port        = "443"
      protocol    = "HTTPS"
      status_code = "HTTP_301"
    }
  }
}

# HTTPS Listener
resource "aws_lb_listener" "https" {
  load_balancer_arn = aws_lb.main.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = var.acm_certificate_arn

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.hocuspocus.arn
  }
}
```

```hcl
# modules/realtime/autoscaling.tf

################################################################################
# Auto Scaling
################################################################################

resource "aws_appautoscaling_target" "hocuspocus" {
  max_capacity       = var.max_capacity
  min_capacity       = var.min_capacity
  resource_id        = "service/${aws_ecs_cluster.main.name}/${aws_ecs_service.hocuspocus.name}"
  scalable_dimension = "ecs:service:DesiredCount"
  service_namespace  = "ecs"
}

# CPU Scaling
resource "aws_appautoscaling_policy" "cpu" {
  name               = "${var.project}-${var.environment}-cpu-scaling"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.hocuspocus.resource_id
  scalable_dimension = aws_appautoscaling_target.hocuspocus.scalable_dimension
  service_namespace  = aws_appautoscaling_target.hocuspocus.service_namespace

  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
    target_value       = 70.0
    scale_in_cooldown  = 300
    scale_out_cooldown = 60
  }
}

# Memory Scaling
resource "aws_appautoscaling_policy" "memory" {
  name               = "${var.project}-${var.environment}-memory-scaling"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.hocuspocus.resource_id
  scalable_dimension = aws_appautoscaling_target.hocuspocus.scalable_dimension
  service_namespace  = aws_appautoscaling_target.hocuspocus.service_namespace

  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageMemoryUtilization"
    }
    target_value       = 70.0
    scale_in_cooldown  = 300
    scale_out_cooldown = 60
  }
}

# Connection Count Scaling (Custom Metric)
resource "aws_appautoscaling_policy" "connections" {
  name               = "${var.project}-${var.environment}-connection-scaling"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.hocuspocus.resource_id
  scalable_dimension = aws_appautoscaling_target.hocuspocus.scalable_dimension
  service_namespace  = aws_appautoscaling_target.hocuspocus.service_namespace

  target_tracking_scaling_policy_configuration {
    customized_metric_specification {
      metric_name = "ActiveConnections"
      namespace   = "${var.project}/${var.environment}"
      statistic   = "Average"
      unit        = "Count"
    }
    target_value       = var.target_connections_per_instance
    scale_in_cooldown  = 300
    scale_out_cooldown = 60
  }
}
```

### 3.5 Auth モジュール (Cognito)

```hcl
# modules/auth/main.tf

################################################################################
# Cognito User Pool
################################################################################

resource "aws_cognito_user_pool" "main" {
  name = "${var.project}-${var.environment}-users"

  # ユーザー名設定
  username_attributes      = ["email"]
  auto_verified_attributes = ["email"]

  # パスワードポリシー
  password_policy {
    minimum_length                   = 8
    require_lowercase                = true
    require_numbers                  = true
    require_symbols                  = true
    require_uppercase                = true
    temporary_password_validity_days = 7
  }

  # MFA設定
  mfa_configuration = "OPTIONAL"

  software_token_mfa_configuration {
    enabled = true
  }

  # メール設定
  email_configuration {
    email_sending_account = "DEVELOPER"
    from_email_address    = var.from_email_address
    source_arn            = var.ses_identity_arn
  }

  # アカウント復旧
  account_recovery_setting {
    recovery_mechanism {
      name     = "verified_email"
      priority = 1
    }
  }

  # スキーマ
  schema {
    name                     = "email"
    attribute_data_type      = "String"
    required                 = true
    mutable                  = true
    string_attribute_constraints {
      min_length = 0
      max_length = 256
    }
  }

  schema {
    name                     = "display_name"
    attribute_data_type      = "String"
    required                 = false
    mutable                  = true
    string_attribute_constraints {
      min_length = 0
      max_length = 100
    }
  }

  # 検証メッセージ
  verification_message_template {
    default_email_option  = "CONFIRM_WITH_CODE"
    email_subject         = "[Zedi] メールアドレスの確認"
    email_message         = "確認コード: {####}"
  }

  tags = {
    Name        = "${var.project}-${var.environment}-users"
    Environment = var.environment
  }
}

################################################################################
# User Pool Client
################################################################################

resource "aws_cognito_user_pool_client" "web" {
  name         = "${var.project}-${var.environment}-web-client"
  user_pool_id = aws_cognito_user_pool.main.id

  # 認証フロー
  explicit_auth_flows = [
    "ALLOW_USER_SRP_AUTH",
    "ALLOW_REFRESH_TOKEN_AUTH"
  ]

  # トークン有効期限
  access_token_validity  = 1    # 1時間
  id_token_validity      = 1    # 1時間
  refresh_token_validity = 30   # 30日

  token_validity_units {
    access_token  = "hours"
    id_token      = "hours"
    refresh_token = "days"
  }

  # OAuth設定
  allowed_oauth_flows                  = ["code"]
  allowed_oauth_flows_user_pool_client = true
  allowed_oauth_scopes                 = ["email", "openid", "profile"]
  callback_urls                        = var.callback_urls
  logout_urls                          = var.logout_urls
  supported_identity_providers         = ["COGNITO"]

  # セキュリティ
  prevent_user_existence_errors = "ENABLED"
  enable_token_revocation       = true

  # シークレット不要（SPAの場合）
  generate_secret = false
}

################################################################################
# User Pool Domain
################################################################################

resource "aws_cognito_user_pool_domain" "main" {
  domain       = "${var.project}-${var.environment}"
  user_pool_id = aws_cognito_user_pool.main.id
}

################################################################################
# Identity Pool (for AWS credentials)
################################################################################

resource "aws_cognito_identity_pool" "main" {
  identity_pool_name               = "${var.project}-${var.environment}-identity"
  allow_unauthenticated_identities = false

  cognito_identity_providers {
    client_id               = aws_cognito_user_pool_client.web.id
    provider_name           = aws_cognito_user_pool.main.endpoint
    server_side_token_check = true
  }

  tags = {
    Name        = "${var.project}-${var.environment}-identity"
    Environment = var.environment
  }
}
```

---

## 4. 環境別設定

### 4.1 開発環境 (dev)

```hcl
# environments/dev/terraform.tfvars

project     = "zedi"
environment = "dev"
aws_region  = "ap-northeast-1"

# Networking
vpc_cidr           = "10.0.0.0/16"
availability_zones = ["ap-northeast-1a", "ap-northeast-1c"]
enable_nat_gateway = false  # コスト最適化: VPC Endpointを使用

# Database (Aurora Serverless v2 最小構成)
database_name           = "zedi"
master_username         = "zedi_admin"
min_capacity            = 0.5    # 最小ACU (アイドル時のコスト削減)
max_capacity            = 2      # 必要時にスケール
instance_count          = 1
backup_retention_period = 1

# Cache
redis_node_type           = "cache.t4g.micro"  # Graviton2でコスト効率化
redis_num_cache_clusters  = 1
redis_snapshot_retention  = 0

# ECS (Fargate Spot でコスト削減)
hocuspocus_task_cpu      = 256
hocuspocus_task_memory   = 512
hocuspocus_desired_count = 1
hocuspocus_min_capacity  = 1
hocuspocus_max_capacity  = 2
use_fargate_spot         = true   # 約70%コスト削減
target_connections_per_instance = 100

# Monitoring
log_retention_days = 7
```

### 4.2 本番環境 (prod)

```hcl
# environments/prod/terraform.tfvars

project     = "zedi"
environment = "prod"
aws_region  = "ap-northeast-1"

# Networking
vpc_cidr           = "10.1.0.0/16"
availability_zones = ["ap-northeast-1a", "ap-northeast-1c"]  # 小規模時は2AZで十分
enable_nat_gateway = false  # コスト最適化: VPC Endpointを使用

# Database (Aurora Serverless v2 - 小規模運用)
database_name           = "zedi"
master_username         = "zedi_admin"
min_capacity            = 0.5    # アイドル時は最小
max_capacity            = 4      # 必要時にスケール
instance_count          = 1      # 小規模時はシングルインスタンス
backup_retention_period = 7

# Cache (小規模運用)
redis_node_type           = "cache.t4g.micro"  # Graviton2
redis_num_cache_clusters  = 1      # 小規模時はシングル
redis_snapshot_retention  = 1

# ECS (Fargate Spot でコスト削減)
hocuspocus_task_cpu      = 256
hocuspocus_task_memory   = 512
hocuspocus_desired_count = 1
hocuspocus_min_capacity  = 1
hocuspocus_max_capacity  = 3
use_fargate_spot         = true   # 約70%コスト削減
target_connections_per_instance = 100

# Monitoring
log_retention_days = 14
```

---

## 5. 実装タスク一覧

### Phase 1: AWS基盤構築 (Week 1-2)

| # | タスク | 優先度 | 依存 | 見積時間 |
|---|--------|--------|------|----------|
| 1.1 | Terraform backend (S3 + DynamoDB) | 高 | - | 2h |
| 1.2 | Networking モジュール実装 | 高 | 1.1 | 4h |
| 1.3 | Security モジュール実装 | 高 | 1.2 | 4h |
| 1.4 | Database モジュール実装 | 高 | 1.2, 1.3 | 4h |
| 1.5 | Cache モジュール実装 | 高 | 1.2, 1.3 | 3h |
| 1.6 | Auth モジュール実装 | 高 | - | 4h |
| 1.7 | Realtime モジュール実装 | 高 | 1.2-1.5 | 8h |
| 1.8 | CDN モジュール実装 | 中 | 1.2 | 4h |
| 1.9 | API モジュール実装 | 中 | 1.2, 1.4 | 6h |
| 1.10 | Monitoring モジュール実装 | 中 | 1.2-1.7 | 4h |
| 1.11 | Dev環境デプロイ | 高 | 1.1-1.10 | 4h |
| 1.12 | 動作確認・調整 | 高 | 1.11 | 8h |

---

## 6. コスト見積もり

### 設計方針: コスト最適化構成

以下のコスト削減策を適用:
- **NAT Gateway → VPC Endpoint**: $32/月 → $14/月 (約55%削減)
- **Fargate → Fargate Spot**: 約70%削減
- **Graviton2インスタンス**: 約20%削減
- **Aurora最小ACU**: アイドル時のコスト最小化

### 6.1 開発環境 (月額)

| サービス | スペック | 概算コスト | 備考 |
|---------|---------|-----------|------|
| Aurora Serverless v2 | 0.5 ACU (最小) | ~$25 | アイドル時は最小課金 |
| ElastiCache | cache.t4g.micro x 1 | ~$12 | Graviton2 |
| ECS Fargate Spot | 0.25 vCPU, 0.5GB x 1 | ~$3 | Spot割引 |
| VPC Endpoints | Interface x 4 | ~$15 | NAT Gateway代替 |
| ALB | 1台 | ~$16 | |
| CloudFront | 最小 | ~$1 | |
| S3 | ~1GB | ~$0.03 | |
| CloudWatch | 基本 | ~$3 | |
| Route 53 | 1ゾーン | ~$0.50 | |
| Secrets Manager | 2シークレット | ~$0.80 | |
| **合計** | | **~$76/月** | 約11,400円/月 |

### 6.2 本番環境 (月額・小規模: 数名ユーザー)

| サービス | スペック | 概算コスト | 備考 |
|---------|---------|-----------|------|
| Aurora Serverless v2 | 0.5-4 ACU | ~$25 | 使用時のみスケール |
| ElastiCache | cache.t4g.micro x 1 | ~$12 | Graviton2 |
| ECS Fargate Spot | 0.25 vCPU, 0.5GB x 1 | ~$3 | Spot割引 |
| VPC Endpoints | Interface x 4 | ~$15 | NAT Gateway代替 |
| ALB | 1台 | ~$16 | |
| CloudFront | 最小 | ~$1 | |
| S3 | ~5GB | ~$0.15 | |
| CloudWatch | 基本 | ~$3 | |
| Route 53 | 1ゾーン | ~$0.50 | |
| Secrets Manager | 2シークレット | ~$0.80 | |
| **合計** | | **~$76/月** | 約11,400円/月 |

### 6.3 スケールアップ時の参考コスト

ユーザー数増加に応じて以下のようにスケール:

| ユーザー規模 | 月額コスト | 主な変更点 |
|-------------|-----------|------------|
| ~5名 | ~$76/月 | 現構成 |
| ~50名 | ~$120/月 | Aurora 2ACU, ECS x2 |
| ~500名 | ~$300/月 | Aurora 4ACU, Redis large, ECS x3 |
| ~1000名以上 | ~$500/月〜 | Multi-AZ, Reserved Capacity検討 |

---

## 7. 次のステップ

1. **AWSアカウント準備**
   - 本番/開発用のAWSアカウント分離（AWS Organizations推奨）
   - IAMユーザー/ロール設定
   - AWS CLI設定

2. **Terraformセットアップ**
   - tfenvでバージョン管理
   - Backend用S3バケット作成
   - DynamoDB状態ロックテーブル作成

3. **実装開始**
   - Networkingモジュールから順次実装
   - 各モジュールはdev環境で検証後にprodへ

4. **CI/CD構築**
   - GitHub Actionsでterraform plan/apply自動化
   - PRレビュー時にplan結果表示
