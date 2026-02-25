# Zedi Cache Module
# ElastiCache Redis for Hocuspocus session management

################################################################################
# ElastiCache Subnet Group
################################################################################

resource "aws_elasticache_subnet_group" "main" {
  name        = "zedi-${var.environment}-redis-subnet"
  description = "Redis subnet group for Zedi ${var.environment}"
  subnet_ids  = var.private_subnet_ids

  tags = merge(var.tags, {
    Name = "zedi-${var.environment}-redis-subnet"
  })
}

################################################################################
# Security Group for Redis
################################################################################

resource "aws_security_group" "redis" {
  name        = "zedi-${var.environment}-redis-sg"
  description = "Security group for ElastiCache Redis"
  vpc_id      = var.vpc_id

  # Redis from VPC
  ingress {
    description = "Redis from VPC"
    from_port   = var.port
    to_port     = var.port
    protocol    = "tcp"
    cidr_blocks = [var.vpc_cidr]
  }

  egress {
    description = "All outbound"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(var.tags, {
    Name = "zedi-${var.environment}-redis-sg"
  })
}

################################################################################
# ElastiCache Parameter Group
################################################################################

resource "aws_elasticache_parameter_group" "main" {
  name        = "zedi-${var.environment}-redis-pg"
  family      = var.parameter_family
  description = "Redis parameter group for Zedi ${var.environment}"

  # メモリポリシー: LRU (Least Recently Used) でキー削除
  parameter {
    name  = "maxmemory-policy"
    value = "allkeys-lru"
  }

  # 通知設定（キースペースイベント）
  parameter {
    name  = "notify-keyspace-events"
    value = "Ex" # Expired events
  }

  # TCP keepalive
  parameter {
    name  = "tcp-keepalive"
    value = "300"
  }

  tags = merge(var.tags, {
    Name = "zedi-${var.environment}-redis-pg"
  })
}

################################################################################
# ElastiCache Replication Group (Redis)
################################################################################

resource "aws_elasticache_replication_group" "main" {
  replication_group_id = "zedi-${var.environment}-redis"
  description          = "Redis for Zedi ${var.environment} (Hocuspocus)"

  # Engine settings
  engine               = "redis"
  engine_version       = var.engine_version
  node_type            = var.node_type
  port                 = var.port
  parameter_group_name = aws_elasticache_parameter_group.main.name

  # Network
  subnet_group_name  = aws_elasticache_subnet_group.main.name
  security_group_ids = [aws_security_group.redis.id]

  # Cluster configuration (single node for dev)
  num_cache_clusters         = var.num_cache_nodes
  automatic_failover_enabled = var.num_cache_nodes > 1 ? true : false
  multi_az_enabled           = var.num_cache_nodes > 1 ? true : false

  # Encryption
  at_rest_encryption_enabled = true
  transit_encryption_enabled = true
  # Note: AUTH token not set - using transit encryption only
  # For production, consider adding auth_token for additional security

  # Maintenance & Backups
  maintenance_window       = var.maintenance_window
  snapshot_window          = var.snapshot_window
  snapshot_retention_limit = var.snapshot_retention_limit
  apply_immediately        = var.apply_immediately

  # Auto minor version upgrade
  auto_minor_version_upgrade = true

  # Logging (CloudWatch)
  log_delivery_configuration {
    destination      = aws_cloudwatch_log_group.redis_slow_log.name
    destination_type = "cloudwatch-logs"
    log_format       = "json"
    log_type         = "slow-log"
  }

  log_delivery_configuration {
    destination      = aws_cloudwatch_log_group.redis_engine_log.name
    destination_type = "cloudwatch-logs"
    log_format       = "json"
    log_type         = "engine-log"
  }

  tags = merge(var.tags, {
    Name = "zedi-${var.environment}-redis"
  })
}

################################################################################
# CloudWatch Log Groups for Redis
################################################################################

resource "aws_cloudwatch_log_group" "redis_slow_log" {
  name              = "/aws/elasticache/zedi-${var.environment}/slow-log"
  retention_in_days = var.environment == "prod" ? 30 : 7

  tags = merge(var.tags, {
    Name = "zedi-${var.environment}-redis-slow-log"
  })
}

resource "aws_cloudwatch_log_group" "redis_engine_log" {
  name              = "/aws/elasticache/zedi-${var.environment}/engine-log"
  retention_in_days = var.environment == "prod" ? 30 : 7

  tags = merge(var.tags, {
    Name = "zedi-${var.environment}-redis-engine-log"
  })
}
