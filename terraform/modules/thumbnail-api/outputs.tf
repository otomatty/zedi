# Zedi Thumbnail API Module - Outputs

output "thumbnails_bucket_name" {
  description = "S3 bucket name for thumbnails"
  value       = aws_s3_bucket.thumbnails.id
}

output "thumbnails_bucket_arn" {
  description = "S3 bucket ARN for thumbnails"
  value       = aws_s3_bucket.thumbnails.arn
}

output "cloudfront_domain" {
  description = "CloudFront distribution domain for thumbnail delivery"
  value       = aws_cloudfront_distribution.thumbnails.domain_name
}

output "cloudfront_url" {
  description = "CloudFront base URL for thumbnails"
  value       = "https://${aws_cloudfront_distribution.thumbnails.domain_name}"
}

output "thumbnail_secrets_arn" {
  description = "ARN of Thumbnail API secrets (Custom Search)"
  value       = aws_secretsmanager_secret.thumbnail_keys.arn
}
