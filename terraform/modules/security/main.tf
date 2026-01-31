# Zedi Security Module
# Cognito User Pool, IAM Roles for ECS

################################################################################
# Cognito User Pool
################################################################################

resource "aws_cognito_user_pool" "main" {
  name = "zedi-${var.environment}-users"

  # ユーザー名設定（メールアドレスをユーザー名として使用）
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

  # MFA設定（オプショナル）
  mfa_configuration = "OPTIONAL"

  software_token_mfa_configuration {
    enabled = true
  }

  # アカウント復旧設定
  account_recovery_setting {
    recovery_mechanism {
      name     = "verified_email"
      priority = 1
    }
  }

  # ユーザー属性スキーマ
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

  # 検証メッセージテンプレート
  verification_message_template {
    default_email_option = "CONFIRM_WITH_CODE"
    email_subject        = "[Zedi] メールアドレスの確認"
    email_message        = "確認コード: {####}"
  }

  # ユーザー存在エラーの防止
  user_attribute_update_settings {
    attributes_require_verification_before_update = ["email"]
  }

  tags = merge(var.tags, {
    Name = "zedi-${var.environment}-users"
  })
}

################################################################################
# Cognito User Pool Client (Web SPA)
################################################################################

resource "aws_cognito_user_pool_client" "web" {
  name         = "zedi-${var.environment}-web-client"
  user_pool_id = aws_cognito_user_pool.main.id

  # 認証フロー
  explicit_auth_flows = [
    "ALLOW_USER_SRP_AUTH",
    "ALLOW_REFRESH_TOKEN_AUTH"
  ]

  # トークン有効期限
  access_token_validity  = 1   # 1時間
  id_token_validity      = 1   # 1時間
  refresh_token_validity = 30  # 30日

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

  # セキュリティ設定
  prevent_user_existence_errors = "ENABLED"
  enable_token_revocation       = true

  # SPA用（シークレット不要）
  generate_secret = false
}

################################################################################
# Cognito User Pool Domain
################################################################################

resource "aws_cognito_user_pool_domain" "main" {
  domain       = "zedi-${var.environment}-${data.aws_caller_identity.current.account_id}"
  user_pool_id = aws_cognito_user_pool.main.id
}

################################################################################
# Data Sources
################################################################################

data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

################################################################################
# IAM Role - ECS Task Execution Role
# ECSがタスクを起動するために必要な権限
################################################################################

resource "aws_iam_role" "ecs_execution" {
  name = "zedi-${var.environment}-ecs-execution-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "ecs-tasks.amazonaws.com"
        }
      }
    ]
  })

  tags = merge(var.tags, {
    Name = "zedi-${var.environment}-ecs-execution-role"
  })
}

# ECS Task Execution Role - AmazonECSTaskExecutionRolePolicy
resource "aws_iam_role_policy_attachment" "ecs_execution_policy" {
  role       = aws_iam_role.ecs_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

# ECS Task Execution Role - Secrets Manager アクセス（DB認証情報取得用）
resource "aws_iam_role_policy" "ecs_execution_secrets" {
  name = "zedi-${var.environment}-ecs-execution-secrets"
  role = aws_iam_role.ecs_execution.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "secretsmanager:GetSecretValue"
        ]
        Resource = [
          "arn:aws:secretsmanager:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:secret:zedi-${var.environment}-*"
        ]
      }
    ]
  })
}

################################################################################
# IAM Role - ECS Task Role
# アプリケーションが実行時に必要なAWSサービスへのアクセス権限
################################################################################

resource "aws_iam_role" "ecs_task" {
  name = "zedi-${var.environment}-ecs-task-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "ecs-tasks.amazonaws.com"
        }
      }
    ]
  })

  tags = merge(var.tags, {
    Name = "zedi-${var.environment}-ecs-task-role"
  })
}

# ECS Task Role - S3 アクセス（画像ストレージ用）
resource "aws_iam_role_policy" "ecs_task_s3" {
  name = "zedi-${var.environment}-ecs-task-s3"
  role = aws_iam_role.ecs_task.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:PutObject",
          "s3:DeleteObject",
          "s3:ListBucket"
        ]
        Resource = [
          "arn:aws:s3:::zedi-${var.environment}-*",
          "arn:aws:s3:::zedi-${var.environment}-*/*"
        ]
      }
    ]
  })
}

# ECS Task Role - CloudWatch Logs アクセス
resource "aws_iam_role_policy" "ecs_task_logs" {
  name = "zedi-${var.environment}-ecs-task-logs"
  role = aws_iam_role.ecs_task.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ]
        Resource = [
          "arn:aws:logs:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:log-group:/ecs/zedi-${var.environment}*:*"
        ]
      }
    ]
  })
}

# ECS Task Role - SSM Parameter Store アクセス（設定値取得用）
resource "aws_iam_role_policy" "ecs_task_ssm" {
  name = "zedi-${var.environment}-ecs-task-ssm"
  role = aws_iam_role.ecs_task.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "ssm:GetParameter",
          "ssm:GetParameters",
          "ssm:GetParametersByPath"
        ]
        Resource = [
          "arn:aws:ssm:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:parameter/zedi/${var.environment}/*"
        ]
      }
    ]
  })
}
