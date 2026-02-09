# Zedi REST API Module
# API Gateway HTTP API + Lambda + Cognito JWT Authorizer
# C1-2: REST API 基盤

data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

locals {
  cognito_issuer = "https://cognito-idp.${data.aws_region.current.name}.amazonaws.com/${var.cognito_user_pool_id}"
}

################################################################################
# Lambda: npm install を apply 前に実行（node_modules を ZIP に含める）
################################################################################

resource "null_resource" "lambda_npm" {
  triggers = {
    package_json    = filemd5("${path.module}/lambda/package.json")
    package_lock    = fileexists("${path.module}/lambda/package-lock.json") ? filemd5("${path.module}/lambda/package-lock.json") : "no-lock"
  }
  provisioner "local-exec" {
    command     = "npm ci"
    working_dir = "${path.module}/lambda"
  }
}

data "archive_file" "lambda" {
  type        = "zip"
  source_dir  = "${path.module}/lambda"
  output_path = "${path.module}/lambda.zip"
  depends_on  = [null_resource.lambda_npm]
}

resource "aws_iam_role" "lambda" {
  name = "zedi-${var.environment}-api-lambda"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
    }]
  })
  tags = var.tags
}

resource "aws_iam_role_policy_attachment" "lambda_logs" {
  role       = aws_iam_role.lambda.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

# Secrets Manager + RDS Data API (for C1-3 以降). Always attach; empty ARNs = no access.
resource "aws_iam_role_policy" "lambda_db" {
  name   = "zedi-${var.environment}-api-lambda-db"
  role   = aws_iam_role.lambda.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = concat(
      var.db_credentials_secret_arn != "" ? [{
        Effect   = "Allow"
        Action   = ["secretsmanager:GetSecretValue"]
        Resource = [var.db_credentials_secret_arn]
      }] : [],
      var.aurora_cluster_arn != "" ? [{
        Effect   = "Allow"
        Action   = ["rds-data:ExecuteStatement", "rds-data:BatchExecuteStatement"]
        Resource = [var.aurora_cluster_arn]
      }] : [],
      # IAM requires at least one statement; no-op when no DB configured
      var.db_credentials_secret_arn == "" && var.aurora_cluster_arn == "" ? [{
        Effect   = "Allow"
        Action   = ["lambda:GetFunction"]
        Resource = [aws_lambda_function.main.arn]
      }] : []
    )
  })
}

resource "aws_lambda_function" "main" {
  filename         = data.archive_file.lambda.output_path
  function_name    = "zedi-${var.environment}-api"
  role             = aws_iam_role.lambda.arn
  handler          = "index.handler"
  source_code_hash = data.archive_file.lambda.output_base64sha256
  runtime          = "nodejs20.x"
  timeout          = 30

  environment {
    variables = {
      NODE_OPTIONS           = "--enable-source-maps"
      ENVIRONMENT            = var.environment
      AURORA_DATABASE_NAME   = var.aurora_database_name
      DB_CREDENTIALS_SECRET  = var.db_credentials_secret_arn
      AURORA_CLUSTER_ARN     = var.aurora_cluster_arn
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
}

resource "aws_apigatewayv2_authorizer" "jwt" {
  api_id           = aws_apigatewayv2_api.main.id
  authorizer_type   = "JWT"
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

# ヘルスチェック用（認証なし・オプション）
resource "aws_apigatewayv2_route" "health" {
  api_id    = aws_apigatewayv2_api.main.id
  route_key = "GET /api/health"
  target = "integrations/${aws_apigatewayv2_integration.lambda.id}"
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
