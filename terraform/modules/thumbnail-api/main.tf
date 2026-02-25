# Zedi Thumbnail API Module
# S3 + CloudFront + Secrets Manager (Google Custom Search)
# Phase 0-B: Lambda は api モジュールの統合 Lambda に移行済み

data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

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
    GOOGLE_CUSTOM_SEARCH_API_KEY   = var.google_custom_search_api_key
    GOOGLE_CUSTOM_SEARCH_ENGINE_ID = var.google_custom_search_engine_id
  })

  lifecycle {
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
  wait_for_deployment = false
  retain_on_delete    = true

  origin {
    domain_name              = aws_s3_bucket.thumbnails.bucket_regional_domain_name
    origin_id                = "S3-${aws_s3_bucket.thumbnails.id}"
    origin_access_control_id = aws_cloudfront_origin_access_control.thumbnails.id
  }

  default_cache_behavior {
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
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
