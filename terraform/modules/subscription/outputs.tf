# Zedi Subscription Module - Outputs

output "lemonsqueezy_secret_arn" {
  description = "ARN of the LemonSqueezy secrets"
  value       = aws_secretsmanager_secret.lemonsqueezy.arn
}
