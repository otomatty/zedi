# Zedi CDN Module - CloudFront distribution and Origin Access Control

terraform {
  required_providers {
    aws = {
      source                = "hashicorp/aws"
      configuration_aliases = [aws.us_east_1]
    }
  }
}

resource "aws_cloudfront_origin_access_control" "main" {
  name                              = "zedi-${var.environment}-frontend-oac"
  description                       = "OAC for Zedi ${var.environment} frontend S3 bucket"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

locals {
  s3_origin_id = "S3-zedi-${var.environment}-frontend"
  # Custom domain on CloudFront only when cert is attached (after ACM validation when using Cloudflare)
  aliases = var.domain_name != "" && var.attach_custom_domain ? [var.domain_name, "www.${var.domain_name}"] : []
}

resource "aws_cloudfront_distribution" "main" {
  enabled             = true
  is_ipv6_enabled     = true
  comment             = "Zedi ${var.environment} frontend"
  default_root_object = "index.html"
  price_class         = "PriceClass_200" # US, Canada, Europe, Asia

  aliases = local.aliases

  origin {
    domain_name              = aws_s3_bucket.frontend.bucket_regional_domain_name
    origin_id                = local.s3_origin_id
    origin_access_control_id = aws_cloudfront_origin_access_control.main.id
  }

  default_cache_behavior {
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = local.s3_origin_id
    compress               = true
    viewer_protocol_policy = "redirect-to-https"

    forwarded_values {
      query_string = false
      cookies {
        forward = "none"
      }
    }

    min_ttl     = 0
    default_ttl = 3600
    max_ttl     = 86400
  }

  # SPA: 403 (no key) and 404 -> index.html
  custom_error_response {
    error_code         = 403
    response_code      = 200
    response_page_path = "/index.html"
  }

  custom_error_response {
    error_code         = 404
    response_code      = 200
    response_page_path = "/index.html"
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    acm_certificate_arn            = var.domain_name != "" && var.attach_custom_domain ? aws_acm_certificate.frontend[0].arn : null
    ssl_support_method             = var.domain_name != "" && var.attach_custom_domain ? "sni-only" : null
    minimum_protocol_version       = var.domain_name != "" && var.attach_custom_domain ? "TLSv1.2_2021" : null
    cloudfront_default_certificate = !(var.domain_name != "" && var.attach_custom_domain)
  }

  tags = merge(var.tags, {
    Name = "zedi-${var.environment}-frontend"
  })
}
