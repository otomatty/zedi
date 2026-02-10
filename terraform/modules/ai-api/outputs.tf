# Zedi AI API Module - Outputs

output "function_url" {
  description = "Lambda Function URL for the AI API (streaming-enabled)"
  value       = aws_lambda_function_url.ai_api.function_url
}

output "lambda_function_name" {
  description = "Lambda function name"
  value       = aws_lambda_function.ai_api.function_name
}

output "lambda_function_arn" {
  description = "Lambda function ARN"
  value       = aws_lambda_function.ai_api.arn
}

output "rate_limit_table_name" {
  description = "DynamoDB table name for rate limiting"
  value       = aws_dynamodb_table.rate_limit.name
}

output "ai_secrets_arn" {
  description = "ARN of the AI provider keys secret"
  value       = aws_secretsmanager_secret.ai_keys.arn
}
