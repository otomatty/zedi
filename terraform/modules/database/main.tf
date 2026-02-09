# Zedi Database Module
# Aurora Serverless v2 (PostgreSQL)

################################################################################
# Random Password for Master User
################################################################################

resource "random_password" "master" {
  length           = 32
  special          = true
  override_special = "!#$%&*()-_=+[]{}<>:?"
}

################################################################################
# Secrets Manager - Database Credentials
################################################################################

resource "aws_secretsmanager_secret" "db_credentials" {
  name                    = "zedi-${var.environment}-db-credentials"
  description             = "Aurora PostgreSQL credentials for Zedi ${var.environment}"
  recovery_window_in_days = var.environment == "prod" ? 30 : 0

  tags = merge(var.tags, {
    Name = "zedi-${var.environment}-db-credentials"
  })
}

resource "aws_secretsmanager_secret_version" "db_credentials" {
  secret_id = aws_secretsmanager_secret.db_credentials.id
  secret_string = jsonencode({
    username = var.master_username
    password = random_password.master.result
    engine   = "postgres"
    host     = aws_rds_cluster.main.endpoint
    port     = aws_rds_cluster.main.port
    dbname   = var.database_name
  })
}

################################################################################
# DB Subnet Group
################################################################################

resource "aws_db_subnet_group" "main" {
  name        = "zedi-${var.environment}-db-subnet"
  description = "Database subnet group for Zedi ${var.environment}"
  subnet_ids  = var.private_subnet_ids

  tags = merge(var.tags, {
    Name = "zedi-${var.environment}-db-subnet"
  })
}

################################################################################
# Security Group for Aurora
################################################################################

resource "aws_security_group" "aurora" {
  name        = "zedi-${var.environment}-aurora-sg"
  description = "Security group for Aurora PostgreSQL"
  vpc_id      = var.vpc_id

  # PostgreSQL from VPC
  ingress {
    description = "PostgreSQL from VPC"
    from_port   = 5432
    to_port     = 5432
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
    Name = "zedi-${var.environment}-aurora-sg"
  })
}

################################################################################
# Aurora Cluster Parameter Group
################################################################################

resource "aws_rds_cluster_parameter_group" "main" {
  name        = "zedi-${var.environment}-cluster-pg"
  family      = "aurora-postgresql15"
  description = "Aurora PostgreSQL cluster parameter group for Zedi"

  # 開発時のデバッグ用（本番では調整）
  parameter {
    name  = "log_statement"
    value = var.environment == "prod" ? "ddl" : "all"
  }

  parameter {
    name  = "log_min_duration_statement"
    value = "1000" # 1秒以上のクエリをログ
  }

  tags = merge(var.tags, {
    Name = "zedi-${var.environment}-cluster-pg"
  })
}

################################################################################
# Aurora DB Parameter Group
################################################################################

resource "aws_db_parameter_group" "main" {
  name        = "zedi-${var.environment}-db-pg"
  family      = "aurora-postgresql15"
  description = "Aurora PostgreSQL instance parameter group for Zedi"

  parameter {
    name  = "shared_preload_libraries"
    value = "pg_stat_statements"
  }

  tags = merge(var.tags, {
    Name = "zedi-${var.environment}-db-pg"
  })
}

################################################################################
# Aurora Serverless v2 Cluster
################################################################################

resource "aws_rds_cluster" "main" {
  cluster_identifier     = "zedi-${var.environment}-cluster"
  engine                 = "aurora-postgresql"
  engine_mode            = "provisioned"
  engine_version         = "15.8"
  database_name          = var.database_name
  master_username        = var.master_username
  master_password        = random_password.master.result
  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.aurora.id]

  db_cluster_parameter_group_name = aws_rds_cluster_parameter_group.main.name

  # Serverless v2 設定（min_capacity=0 のときは seconds_until_auto_pause 必須でスケールゼロ＋自動ポーズ）
  serverlessv2_scaling_configuration {
    min_capacity            = var.min_capacity
    max_capacity            = var.max_capacity
    seconds_until_auto_pause = var.seconds_until_auto_pause
  }

  # バックアップ設定
  backup_retention_period = var.backup_retention_period
  preferred_backup_window = "03:00-04:00" # JST 12:00-13:00

  # メンテナンス設定
  preferred_maintenance_window = "sun:04:00-sun:05:00" # JST 日曜 13:00-14:00

  # 暗号化
  storage_encrypted = true

  # 削除保護（本番のみ）
  deletion_protection = var.environment == "prod" ? true : false

  # Data API有効化（Lambda等からのアクセス用）
  enable_http_endpoint = true

  # スナップショット設定
  skip_final_snapshot       = var.environment != "prod"
  final_snapshot_identifier = var.environment == "prod" ? "zedi-${var.environment}-final-snapshot" : null

  # IAM認証
  iam_database_authentication_enabled = true

  tags = merge(var.tags, {
    Name = "zedi-${var.environment}-cluster"
  })

  lifecycle {
    ignore_changes = [master_password]
  }
}

################################################################################
# Aurora Serverless v2 Instance
################################################################################

resource "aws_rds_cluster_instance" "main" {
  count                   = var.instance_count
  identifier              = "zedi-${var.environment}-instance-${count.index + 1}"
  cluster_identifier      = aws_rds_cluster.main.id
  instance_class          = "db.serverless"
  engine                  = aws_rds_cluster.main.engine
  engine_version          = aws_rds_cluster.main.engine_version
  db_parameter_group_name = aws_db_parameter_group.main.name

  # Performance Insights（無料枠: 7日間保持）
  performance_insights_enabled          = true
  performance_insights_retention_period = 7

  # パブリックアクセス無効
  publicly_accessible = false

  tags = merge(var.tags, {
    Name = "zedi-${var.environment}-instance-${count.index + 1}"
  })
}
