# Zedi CDN Module - Outputs

output "bucket_id" {
  description = "S3 bucket name (use for deploy: aws s3 sync dist/ s3://<this>)"
  value       = aws_s3_bucket.frontend.id
}

output "bucket_arn" {
  description = "S3 bucket ARN"
  value       = aws_s3_bucket.frontend.arn
}

output "distribution_id" {
  description = "CloudFront distribution ID (use for invalidation)"
  value       = aws_cloudfront_distribution.main.id
}

output "distribution_domain_name" {
  description = "CloudFront distribution domain name (xxx.cloudfront.net)"
  value       = aws_cloudfront_distribution.main.domain_name
}

output "distribution_hosted_zone_id" {
  description = "CloudFront hosted zone ID (for Route53 Alias)"
  value       = aws_cloudfront_distribution.main.hosted_zone_id
}

output "frontend_url" {
  description = "Frontend URL (https://domain_name or https://distribution_domain_name)"
  value       = var.domain_name != "" ? "https://${var.domain_name}" : "https://${aws_cloudfront_distribution.main.domain_name}"
}

output "acm_certificate_arn" {
  description = "ACM certificate ARN (us-east-1). Empty when domain_name is not set."
  value       = var.domain_name != "" ? aws_acm_certificate.frontend[0].arn : ""
}

output "acm_certificate_domain_validation_options" {
  description = "ACM DNS validation records - add these in Cloudflare (or Route53) to issue the certificate"
  value = var.domain_name != "" && var.route53_zone_id == "" ? [
    for dvo in aws_acm_certificate.frontend[0].domain_validation_options : {
      name   = dvo.resource_record_name
      type   = dvo.resource_record_type
      value  = dvo.resource_record_value
      domain = dvo.domain_name
    }
  ] : []
}
