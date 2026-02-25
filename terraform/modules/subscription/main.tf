# Zedi Subscription Module
# Polar Secrets Manager (Access token + Webhook secret)
# Phase 0-B: Lambda は api モジュールの統合 Lambda に移行済み

################################################################################
# Secrets Manager (Polar access token + webhook secret)
################################################################################

resource "aws_secretsmanager_secret" "polar" {
  name                    = "zedi-${var.environment}-polar"
  description             = "Polar access token and webhook secret"
  recovery_window_in_days = var.environment == "prod" ? 30 : 0

  tags = var.tags
}

resource "aws_secretsmanager_secret_version" "polar" {
  secret_id = aws_secretsmanager_secret.polar.id
  secret_string = jsonencode({
    POLAR_ACCESS_TOKEN   = ""
    POLAR_WEBHOOK_SECRET = ""
  })

  lifecycle {
    ignore_changes = [secret_string]
  }
}
