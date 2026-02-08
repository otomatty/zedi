# Zedi CDN Module - Route53 Alias records (only when route53_zone_id is set)

resource "aws_route53_record" "frontend" {
  for_each = var.route53_zone_id != "" && var.domain_name != "" ? toset(["apex", "www"]) : toset([])

  zone_id = var.route53_zone_id
  name    = each.key == "apex" ? "" : "www"
  type    = "A"

  alias {
    name                   = aws_cloudfront_distribution.main.domain_name
    zone_id                = aws_cloudfront_distribution.main.hosted_zone_id
    evaluate_target_health = false
  }
}
