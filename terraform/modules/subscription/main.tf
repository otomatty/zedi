# Zedi Subscription Module
# LemonSqueezy Webhook Lambda + API Gateway route

data "aws_region" "current" {}

################################################################################
# Secrets Manager (LemonSqueezy webhook secret)
################################################################################

resource "aws_secretsmanager_secret" "lemonsqueezy" {
  name                    = "zedi-${var.environment}-lemonsqueezy"
  description             = "LemonSqueezy API key and webhook secret"
  recovery_window_in_days = var.environment == "prod" ? 30 : 0

  tags = var.tags
}

resource "aws_secretsmanager_secret_version" "lemonsqueezy" {
  secret_id = aws_secretsmanager_secret.lemonsqueezy.id
  secret_string = jsonencode({
    LEMONSQUEEZY_API_KEY        = ""
    LEMONSQUEEZY_WEBHOOK_SECRET = ""
    LEMONSQUEEZY_STORE_ID       = ""
  })

  lifecycle {
    ignore_changes = [secret_string]
  }
}

################################################################################
# Lambda: npm install
################################################################################

resource "null_resource" "lambda_npm" {
  triggers = {
    package_json = filemd5("${path.module}/lambda/package.json")
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

################################################################################
# IAM Role
################################################################################

resource "aws_iam_role" "lambda" {
  name = "zedi-${var.environment}-subscription-lambda"

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
  name = "zedi-${var.environment}-subscription-lambda-resources"
  role = aws_iam_role.lambda.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = ["secretsmanager:GetSecretValue"]
        Resource = [
          aws_secretsmanager_secret.lemonsqueezy.arn,
          var.db_credentials_secret_arn,
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "rds-data:ExecuteStatement",
          "rds-data:BatchExecuteStatement",
        ]
        Resource = [var.aurora_cluster_arn]
      },
    ]
  })
}

################################################################################
# Lambda Function
################################################################################

resource "aws_lambda_function" "webhook" {
  filename         = data.archive_file.lambda.output_path
  function_name    = "zedi-${var.environment}-subscription-webhook"
  role             = aws_iam_role.lambda.arn
  handler          = "index.handler"
  source_code_hash = data.archive_file.lambda.output_base64sha256
  runtime          = "nodejs20.x"
  timeout          = 30

  environment {
    variables = {
      NODE_OPTIONS               = "--enable-source-maps"
      ENVIRONMENT                = var.environment
      AURORA_CLUSTER_ARN         = var.aurora_cluster_arn
      DB_CREDENTIALS_SECRET      = var.db_credentials_secret_arn
      AURORA_DATABASE_NAME       = var.aurora_database_name
      LEMONSQUEEZY_WEBHOOK_SECRET = "" # Will be set from Secrets Manager at runtime, or via env
    }
  }

  tags = var.tags
}

################################################################################
# API Gateway integration (webhook endpoint)
################################################################################

resource "aws_apigatewayv2_integration" "webhook" {
  api_id                 = var.api_id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.webhook.invoke_arn
  integration_method     = "POST"
  payload_format_version = "2.0"
}

# POST /api/webhooks/lemonsqueezy — no auth (signature verified in Lambda)
resource "aws_apigatewayv2_route" "webhook" {
  api_id    = var.api_id
  route_key = "POST /api/webhooks/lemonsqueezy"
  target    = "integrations/${aws_apigatewayv2_integration.webhook.id}"
}

resource "aws_lambda_permission" "apigw" {
  statement_id  = "AllowAPIGatewayInvokeSubscriptionWebhook"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.webhook.function_name
  principal     = "apigateway.amazonaws.com"
}

################################################################################
# CloudWatch Log Group
################################################################################

resource "aws_cloudwatch_log_group" "webhook" {
  name              = "/aws/lambda/zedi-${var.environment}-subscription-webhook"
  retention_in_days = var.environment == "prod" ? 30 : 7
  tags              = var.tags
}
