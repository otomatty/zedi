# Zedi Subscription Module - Outputs

output "polar_secret_arn" {
  description = "ARN of the Polar secrets"
  value       = aws_secretsmanager_secret.polar.arn
}
