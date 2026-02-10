# Zedi AI API Module
# Lambda Function URL (Response Streaming) + DynamoDB (Rate Limiting) + Secrets Manager (AI keys)
# VPC-free design: RDS Data API + DynamoDB + Secrets Manager all via HTTPS

data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

################################################################################
# Build Lambda (esbuild TypeScript → dist/index.mjs)
################################################################################

resource "null_resource" "lambda_build" {
  triggers = {
    src_hash = sha256(join("", [
      for f in fileset("${path.module}/lambda/src", "**/*.ts") :
      filemd5("${path.module}/lambda/src/${f}")
    ]))
    package_json = filemd5("${path.module}/lambda/package.json")
  }

  provisioner "local-exec" {
    command     = "npm ci && npm run build"
    working_dir = "${path.module}/lambda"
  }
}

data "archive_file" "lambda" {
  type        = "zip"
  output_path = "${path.module}/lambda.zip"

  source {
    content  = file("${path.module}/lambda/dist/index.mjs")
    filename = "index.mjs"
  }

  # Include source map for debugging
  source {
    content  = fileexists("${path.module}/lambda/dist/index.mjs.map") ? file("${path.module}/lambda/dist/index.mjs.map") : "{}"
    filename = "index.mjs.map"
  }

  depends_on = [null_resource.lambda_build]
}

################################################################################
# DynamoDB Table (Rate Limiting)
################################################################################

resource "aws_dynamodb_table" "rate_limit" {
  name         = "zedi-${var.environment}-ai-rate-limit"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "pk"

  attribute {
    name = "pk"
    type = "S"
  }

  ttl {
    attribute_name = "ttl"
    enabled        = true
  }

  tags = var.tags
}

################################################################################
# Secrets Manager (AI Provider API Keys)
################################################################################

resource "aws_secretsmanager_secret" "ai_keys" {
  name                    = "zedi-${var.environment}-ai-provider-keys"
  description             = "AI provider API keys (OpenAI, Anthropic, Google)"
  recovery_window_in_days = var.environment == "prod" ? 30 : 0

  tags = var.tags
}

# Initial empty secret version (populate manually or via CI)
resource "aws_secretsmanager_secret_version" "ai_keys" {
  secret_id = aws_secretsmanager_secret.ai_keys.id
  secret_string = jsonencode({
    OPENAI_API_KEY    = ""
    ANTHROPIC_API_KEY = ""
    GOOGLE_AI_API_KEY = ""
  })

  lifecycle {
    ignore_changes = [secret_string]
  }
}

################################################################################
# IAM Role
################################################################################

resource "aws_iam_role" "lambda" {
  name = "zedi-${var.environment}-ai-api-lambda"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
    }]
  })

  tags = var.tags
}

resource "aws_iam_role_policy_attachment" "lambda_logs" {
  role       = aws_iam_role.lambda.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy" "lambda_resources" {
  name = "zedi-${var.environment}-ai-api-lambda-resources"
  role = aws_iam_role.lambda.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      # Secrets Manager — AI provider keys + DB credentials
      {
        Effect = "Allow"
        Action = ["secretsmanager:GetSecretValue"]
        Resource = [
          aws_secretsmanager_secret.ai_keys.arn,
          var.db_credentials_secret_arn,
        ]
      },
      # RDS Data API
      {
        Effect = "Allow"
        Action = [
          "rds-data:ExecuteStatement",
          "rds-data:BatchExecuteStatement",
        ]
        Resource = [var.aurora_cluster_arn]
      },
      # DynamoDB — Rate limiting
      {
        Effect = "Allow"
        Action = [
          "dynamodb:UpdateItem",
          "dynamodb:GetItem",
        ]
        Resource = [aws_dynamodb_table.rate_limit.arn]
      },
    ]
  })
}

################################################################################
# Lambda Function
################################################################################

resource "aws_lambda_function" "ai_api" {
  filename         = data.archive_file.lambda.output_path
  function_name    = "zedi-${var.environment}-ai-api"
  role             = aws_iam_role.lambda.arn
  handler          = "index.streamHandler"
  source_code_hash = data.archive_file.lambda.output_base64sha256
  runtime          = "nodejs20.x"
  timeout          = 90
  memory_size      = 512

  environment {
    variables = {
      NODE_OPTIONS          = "--enable-source-maps"
      ENVIRONMENT           = var.environment
      AURORA_CLUSTER_ARN    = var.aurora_cluster_arn
      DB_CREDENTIALS_SECRET = var.db_credentials_secret_arn
      AURORA_DATABASE_NAME  = var.aurora_database_name
      AI_SECRETS_ARN        = aws_secretsmanager_secret.ai_keys.arn
      RATE_LIMIT_TABLE      = aws_dynamodb_table.rate_limit.name
      COGNITO_USER_POOL_ID  = var.cognito_user_pool_id
      COGNITO_REGION        = data.aws_region.current.name
      CORS_ORIGIN           = var.cors_origin
    }
  }

  tags = var.tags
}

################################################################################
# Lambda Function URL (Response Streaming)
################################################################################

resource "aws_lambda_function_url" "ai_api" {
  function_name      = aws_lambda_function.ai_api.function_name
  authorization_type = "NONE" # Auth handled in Lambda code (Cognito JWT)
  invoke_mode        = "RESPONSE_STREAM"

  cors {
    allow_origins     = [var.cors_origin]
    allow_methods     = ["*"]
    allow_headers     = ["Content-Type", "Authorization"]
    max_age           = 86400
    allow_credentials = false
  }
}

################################################################################
# CloudWatch Log Group
################################################################################

resource "aws_cloudwatch_log_group" "ai_api" {
  name              = "/aws/lambda/zedi-${var.environment}-ai-api"
  retention_in_days = var.environment == "prod" ? 30 : 7

  tags = var.tags
}
