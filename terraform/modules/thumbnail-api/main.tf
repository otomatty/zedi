# Zedi Thumbnail API Module
# Lambda (image-search, image-generate, commit) + S3 + Secrets + API Gateway routes

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

  source {
    content  = fileexists("${path.module}/lambda/dist/index.mjs.map") ? file("${path.module}/lambda/dist/index.mjs.map") : "{}"
    filename = "index.mjs.map"
  }

  depends_on = [null_resource.lambda_build]
}

################################################################################
# Secrets Manager (Thumbnail: Google Custom Search)
################################################################################

resource "aws_secretsmanager_secret" "thumbnail_keys" {
  name                    = "zedi-${var.environment}-thumbnail-keys"
  description             = "Thumbnail API keys (Google Custom Search)"
  recovery_window_in_days = var.environment == "prod" ? 30 : 0

  tags = var.tags
}

resource "aws_secretsmanager_secret_version" "thumbnail_keys" {
  secret_id = aws_secretsmanager_secret.thumbnail_keys.id
  secret_string = jsonencode({
    GOOGLE_CUSTOM_SEARCH_API_KEY    = var.google_custom_search_api_key
    GOOGLE_CUSTOM_SEARCH_ENGINE_ID = var.google_custom_search_engine_id
  })

  lifecycle {
    # After first apply, do not overwrite secret value (set in Console or keep via vars)
    ignore_changes = [secret_string]
  }
}

################################################################################
# S3 Bucket (thumbnails)
################################################################################

locals {
  thumbnails_bucket_name = "zedi-${var.environment}-thumbnails-${data.aws_caller_identity.current.account_id}"
}

resource "aws_s3_bucket" "thumbnails" {
  bucket = local.thumbnails_bucket_name

  tags = merge(var.tags, {
    Name = local.thumbnails_bucket_name
  })
}

resource "aws_s3_bucket_versioning" "thumbnails" {
  bucket = aws_s3_bucket.thumbnails.id

  versioning_configuration {
    status = "Disabled"
  }
}

resource "aws_s3_bucket_public_access_block" "thumbnails" {
  bucket = aws_s3_bucket.thumbnails.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

################################################################################
# IAM Role
################################################################################

resource "aws_iam_role" "lambda" {
  name = "zedi-${var.environment}-thumbnail-api-lambda"

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
  name = "zedi-${var.environment}-thumbnail-api-lambda-resources"
  role = aws_iam_role.lambda.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["secretsmanager:GetSecretValue"]
        Resource = [
          aws_secretsmanager_secret.thumbnail_keys.arn,
          var.ai_secrets_arn,
        ]
      },
      {
        Effect   = "Allow"
        Action   = ["rds-data:ExecuteStatement", "rds-data:BatchExecuteStatement"]
        Resource = [var.aurora_cluster_arn]
      },
      {
        Effect   = "Allow"
        Action   = ["secretsmanager:GetSecretValue"]
        Resource = [var.db_credentials_secret_arn]
      },
      {
        Effect   = "Allow"
        Action   = ["dynamodb:UpdateItem", "dynamodb:GetItem"]
        Resource = ["arn:aws:dynamodb:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:table/${var.rate_limit_table_name}"]
      },
      {
        Effect   = "Allow"
        Action   = ["s3:PutObject", "s3:GetObject", "s3:DeleteObject"]
        Resource = ["${aws_s3_bucket.thumbnails.arn}/*"]
      },
    ]
  })
}

################################################################################
# Lambda Function
################################################################################

resource "aws_lambda_function" "thumbnail_api" {
  filename         = data.archive_file.lambda.output_path
  function_name    = "zedi-${var.environment}-thumbnail-api"
  role             = aws_iam_role.lambda.arn
  handler          = "index.handler"
  source_code_hash = data.archive_file.lambda.output_base64sha256
  runtime          = "nodejs20.x"
  timeout          = 60
  memory_size      = 256

  environment {
    variables = {
      NODE_OPTIONS           = "--enable-source-maps"
      ENVIRONMENT           = var.environment
      AURORA_CLUSTER_ARN    = var.aurora_cluster_arn
      DB_CREDENTIALS_SECRET = var.db_credentials_secret_arn
      AURORA_DATABASE_NAME  = var.aurora_database_name
      THUMBNAIL_SECRETS_ARN = aws_secretsmanager_secret.thumbnail_keys.arn
      AI_SECRETS_ARN        = var.ai_secrets_arn
      RATE_LIMIT_TABLE     = var.rate_limit_table_name
      COGNITO_USER_POOL_ID = var.cognito_user_pool_id
      COGNITO_REGION       = data.aws_region.current.name
      CORS_ORIGIN          = var.cors_origin
      THUMBNAIL_BUCKET     = aws_s3_bucket.thumbnails.id
      THUMBNAIL_CLOUDFRONT_URL = "https://${aws_cloudfront_distribution.thumbnails.domain_name}"
    }
  }

  tags = var.tags
}

################################################################################
# CloudFront (S3 thumbnails delivery)
################################################################################

resource "aws_cloudfront_origin_access_control" "thumbnails" {
  name                              = "zedi-${var.environment}-thumbnails-oac"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

resource "aws_cloudfront_distribution" "thumbnails" {
  enabled             = true
  is_ipv6_enabled     = true
  comment             = "Zedi ${var.environment} thumbnails"
  default_root_object = ""
  price_class         = "PriceClass_100"
  # Don't block apply on full propagation (typically 15+ min)
  wait_for_deployment = false
  # Destroy: leave distribution in AWS as disabled instead of waiting for propagation (avoids 90m+ timeout).
  # After destroy, delete the retained distribution in AWS then run terraform destroy again to remove OAC.
  retain_on_delete = true

  origin {
    domain_name              = aws_s3_bucket.thumbnails.bucket_regional_domain_name
    origin_id                 = "S3-${aws_s3_bucket.thumbnails.id}"
    origin_access_control_id = aws_cloudfront_origin_access_control.thumbnails.id
  }

  default_cache_behavior {
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods        = ["GET", "HEAD"]
    target_origin_id       = "S3-${aws_s3_bucket.thumbnails.id}"
    viewer_protocol_policy = "redirect-to-https"
    compress               = true

    forwarded_values {
      query_string = false
      cookies { forward = "none" }
    }
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = true
  }

  tags = var.tags
}

# Allow CloudFront to read from S3
resource "aws_s3_bucket_policy" "thumbnails" {
  bucket = aws_s3_bucket.thumbnails.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid    = "AllowCloudFront"
      Effect = "Allow"
      Principal = {
        Service = "cloudfront.amazonaws.com"
      }
      Action   = "s3:GetObject"
      Resource = "${aws_s3_bucket.thumbnails.arn}/*"
      Condition = {
        StringEquals = {
          "AWS:SourceArn" = aws_cloudfront_distribution.thumbnails.arn
        }
      }
    }]
  })

  depends_on = [aws_s3_bucket_public_access_block.thumbnails]
}

################################################################################
# API Gateway routes (same api_id as REST API)
################################################################################

resource "aws_apigatewayv2_integration" "thumbnail_http" {
  api_id                 = var.api_id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.thumbnail_api.invoke_arn
  integration_method     = "POST"
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "thumbnail_image_search" {
  api_id             = var.api_id
  route_key          = "GET /api/thumbnail/image-search"
  target             = "integrations/${aws_apigatewayv2_integration.thumbnail_http.id}"
  authorization_type = "JWT"
  authorizer_id      = var.authorizer_id
}

resource "aws_apigatewayv2_route" "thumbnail_image_search_options" {
  api_id    = var.api_id
  route_key = "OPTIONS /api/thumbnail/image-search"
  target    = "integrations/${aws_apigatewayv2_integration.thumbnail_http.id}"
}

resource "aws_apigatewayv2_route" "thumbnail_image_generate" {
  api_id             = var.api_id
  route_key          = "POST /api/thumbnail/image-generate"
  target             = "integrations/${aws_apigatewayv2_integration.thumbnail_http.id}"
  authorization_type = "JWT"
  authorizer_id      = var.authorizer_id
}

resource "aws_apigatewayv2_route" "thumbnail_image_generate_options" {
  api_id    = var.api_id
  route_key = "OPTIONS /api/thumbnail/image-generate"
  target    = "integrations/${aws_apigatewayv2_integration.thumbnail_http.id}"
}

resource "aws_apigatewayv2_route" "thumbnail_commit" {
  api_id             = var.api_id
  route_key          = "POST /api/thumbnail/commit"
  target             = "integrations/${aws_apigatewayv2_integration.thumbnail_http.id}"
  authorization_type = "JWT"
  authorizer_id      = var.authorizer_id
}

resource "aws_apigatewayv2_route" "thumbnail_commit_options" {
  api_id    = var.api_id
  route_key = "OPTIONS /api/thumbnail/commit"
  target    = "integrations/${aws_apigatewayv2_integration.thumbnail_http.id}"
}

resource "aws_lambda_permission" "apigw" {
  statement_id  = "AllowAPIGatewayInvokeThumbnailAPI"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.thumbnail_api.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${var.api_execution_arn}/*/*"
}

################################################################################
# CloudWatch Log Group
################################################################################

resource "aws_cloudwatch_log_group" "thumbnail_api" {
  name              = "/aws/lambda/zedi-${var.environment}-thumbnail-api"
  retention_in_days = var.environment == "prod" ? 30 : 7

  tags = var.tags
}
