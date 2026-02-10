# Zedi Subscription Module - Outputs

output "webhook_lambda_function_name" {
  description = "Webhook Lambda function name"
  value       = aws_lambda_function.webhook.function_name
}

output "lemonsqueezy_secret_arn" {
  description = "ARN of the LemonSqueezy secrets"
  value       = aws_secretsmanager_secret.lemonsqueezy.arn
}
