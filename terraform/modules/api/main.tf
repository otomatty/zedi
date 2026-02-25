# Zedi Unified API Module
# API Gateway HTTP API + Hono Lambda + Cognito JWT Authorizer
# Phase 0-B: 4 Lambda → 1 Lambda 統合

data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

# Normalize path for file()/fileexists() on Windows
locals {
  cognito_issuer  = "https://cognito-idp.${data.aws_region.current.name}.amazonaws.com/${var.cognito_user_pool_id}"
  lambda_dist_dir = "${replace(path.module, "\\", "/")}/lambda/dist"
}

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
    content  = file("${local.lambda_dist_dir}/index.mjs")
    filename = "index.mjs"
  }

  source {
    content  = fileexists("${local.lambda_dist_dir}/index.mjs.map") ? file("${local.lambda_dist_dir}/index.mjs.map") : "{}"
    filename = "index.mjs.map"
  }

  depends_on = [null_resource.lambda_build]
}

resource "aws_iam_role" "lambda" {
  name = "zedi-${var.environment}-api-lambda"

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

# Secrets Manager + RDS Data API + DynamoDB + additional Secrets (統合 Lambda 用)
resource "aws_iam_role_policy" "lambda_db" {
  name = "zedi-${var.environment}-api-lambda-db"
  role = aws_iam_role.lambda.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = concat(
      # RDS Data API
      var.aurora_cluster_arn != "" ? [{
        Effect = "Allow"
        Action = [
          "rds-data:ExecuteStatement",
          "rds-data:BatchExecuteStatement",
        ]
        Resource = [var.aurora_cluster_arn]
      }] : [],
      # Secrets Manager — DB credentials + AI keys + Thumbnail keys + Polar
      [{
        Effect = "Allow"
        Action = ["secretsmanager:GetSecretValue"]
        Resource = compact([
          var.db_credentials_secret_arn,
          var.ai_secrets_arn,
          var.thumbnail_secrets_arn,
          var.polar_secret_arn,
        ])
      }],
      # DynamoDB — Rate limiting
      var.rate_limit_table_arn != "" ? [{
        Effect = "Allow"
        Action = [
          "dynamodb:UpdateItem",
          "dynamodb:GetItem",
        ]
        Resource = [var.rate_limit_table_arn]
      }] : [],
      # S3 — Thumbnails bucket
      var.thumbnails_bucket_arn != "" ? [{
        Effect   = "Allow"
        Action   = ["s3:PutObject", "s3:GetObject", "s3:DeleteObject"]
        Resource = ["${var.thumbnails_bucket_arn}/*"]
      }] : [],
      # API Gateway Management API — WebSocket postToConnection
      var.websocket_api_execution_arn != "" ? [{
        Effect   = "Allow"
        Action   = ["execute-api:ManageConnections"]
        Resource = ["${var.websocket_api_execution_arn}/*/*"]
      }] : [],
    )
  })
}

resource "aws_lambda_function" "main" {
  filename         = data.archive_file.lambda.output_path
  function_name    = "zedi-${var.environment}-api"
  role             = aws_iam_role.lambda.arn
  handler          = "index.handler"
  source_code_hash = data.archive_file.lambda.output_base64sha256
  runtime          = "nodejs22.x"
  timeout          = 90
  memory_size      = 512

  environment {
    variables = {
      NODE_OPTIONS             = "--enable-source-maps"
      ENVIRONMENT              = var.environment
      AURORA_DATABASE_NAME     = var.aurora_database_name
      DB_CREDENTIALS_SECRET    = var.db_credentials_secret_arn
      AURORA_CLUSTER_ARN       = var.aurora_cluster_arn
      MEDIA_BUCKET             = aws_s3_bucket.media.id
      CORS_ORIGIN              = var.cors_origin
      COGNITO_USER_POOL_ID     = var.cognito_user_pool_id
      COGNITO_REGION           = data.aws_region.current.name
      AI_SECRETS_ARN           = var.ai_secrets_arn
      RATE_LIMIT_TABLE         = var.rate_limit_table_name
      THUMBNAIL_SECRETS_ARN    = var.thumbnail_secrets_arn
      THUMBNAIL_BUCKET         = var.thumbnails_bucket_name
      THUMBNAIL_CLOUDFRONT_URL = var.thumbnail_cloudfront_url
      POLAR_SECRET_ARN         = var.polar_secret_arn
    }
  }
  tags = var.tags
}

################################################################################
# API Gateway HTTP API
################################################################################

resource "aws_apigatewayv2_api" "main" {
  name          = "zedi-${var.environment}-api"
  protocol_type = "HTTP"
  description   = "Zedi REST API (Lambda + Cognito JWT)"
  tags          = var.tags

  cors_configuration {
    allow_origins = [var.cors_origin]
    allow_methods = ["GET", "POST", "PUT", "DELETE", "OPTIONS"]
    allow_headers = ["Content-Type", "Authorization"]
    max_age       = 86400
  }
}

resource "aws_apigatewayv2_authorizer" "jwt" {
  api_id           = aws_apigatewayv2_api.main.id
  authorizer_type  = "JWT"
  identity_sources = ["$request.header.Authorization"]
  name             = "cognito-jwt"

  jwt_configuration {
    audience = [var.cognito_user_pool_client_id]
    issuer   = local.cognito_issuer
  }
}

resource "aws_apigatewayv2_integration" "lambda" {
  api_id                 = aws_apigatewayv2_api.main.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.main.invoke_arn
  integration_method     = "POST"
  payload_format_version = "2.0"
}

# /api 配下をすべて Lambda にルーティング（認証必須）
resource "aws_apigatewayv2_route" "api_proxy" {
  api_id             = aws_apigatewayv2_api.main.id
  route_key          = "ANY /api/{proxy+}"
  target             = "integrations/${aws_apigatewayv2_integration.lambda.id}"
  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.jwt.id
}

resource "aws_apigatewayv2_route" "api_root" {
  api_id             = aws_apigatewayv2_api.main.id
  route_key          = "ANY /api"
  target             = "integrations/${aws_apigatewayv2_integration.lambda.id}"
  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.jwt.id
}

# OPTIONS preflight routes（認証なし — CORS プリフライトが JWT をバイパスするために必要）
resource "aws_apigatewayv2_route" "api_proxy_options" {
  api_id    = aws_apigatewayv2_api.main.id
  route_key = "OPTIONS /api/{proxy+}"
  target    = "integrations/${aws_apigatewayv2_integration.lambda.id}"
}

resource "aws_apigatewayv2_route" "api_root_options" {
  api_id    = aws_apigatewayv2_api.main.id
  route_key = "OPTIONS /api"
  target    = "integrations/${aws_apigatewayv2_integration.lambda.id}"
}

# ヘルスチェック用（認証なし・オプション）
resource "aws_apigatewayv2_route" "health" {
  api_id    = aws_apigatewayv2_api.main.id
  route_key = "GET /api/health"
  target    = "integrations/${aws_apigatewayv2_integration.lambda.id}"
}

# Webhook（認証なし — Lambda 内で署名検証）
resource "aws_apigatewayv2_route" "webhook_polar" {
  api_id    = aws_apigatewayv2_api.main.id
  route_key = "POST /api/webhooks/polar"
  target    = "integrations/${aws_apigatewayv2_integration.lambda.id}"
}

# AI models（認証なし — Lambda 内で authOptional）
resource "aws_apigatewayv2_route" "ai_models" {
  api_id    = aws_apigatewayv2_api.main.id
  route_key = "GET /api/ai/models"
  target    = "integrations/${aws_apigatewayv2_integration.lambda.id}"
}

resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.main.id
  name        = "$default"
  auto_deploy = true
  tags        = var.tags
}

resource "aws_lambda_permission" "apigw" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.main.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.main.execution_arn}/*/*"
}
