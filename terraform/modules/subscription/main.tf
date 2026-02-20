# Zedi Subscription Module
# LemonSqueezy Secrets Manager (Webhook secret + API key)
# Phase 0-B: Lambda は api モジュールの統合 Lambda に移行済み

################################################################################
# Secrets Manager (LemonSqueezy webhook secret)
################################################################################

resource "aws_secretsmanager_secret" "lemonsqueezy" {
  name                    = "zedi-${var.environment}-lemonsqueezy"
  description             = "LemonSqueezy API key and webhook secret"
  recovery_window_in_days = var.environment == "prod" ? 30 : 0

  tags = var.tags
}

resource "aws_secretsmanager_secret_version" "lemonsqueezy" {
  secret_id = aws_secretsmanager_secret.lemonsqueezy.id
  secret_string = jsonencode({
    LEMONSQUEEZY_API_KEY        = ""
    LEMONSQUEEZY_WEBHOOK_SECRET = ""
    LEMONSQUEEZY_STORE_ID       = ""
  })

  lifecycle {
    ignore_changes = [secret_string]
  }
}
