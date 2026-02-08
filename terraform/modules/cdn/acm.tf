# Zedi CDN Module - ACM certificate (us-east-1 required for CloudFront)

resource "aws_acm_certificate" "frontend" {
  provider = aws.us_east_1

  count = var.domain_name != "" ? 1 : 0

  domain_name               = var.domain_name
  subject_alternative_names = ["www.${var.domain_name}"]
  validation_method        = "DNS"

  tags = merge(var.tags, {
    Name = "zedi-${var.environment}-frontend-${var.domain_name}"
  })

  lifecycle {
    create_before_destroy = true
  }
}

# DNS validation records - only when using Route53 (route53_zone_id set)
# When using Cloudflare, user adds the validation CNAME manually in Cloudflare DNS
resource "aws_route53_record" "acm_validation" {
  for_each = var.domain_name != "" && var.route53_zone_id != "" ? {
    for dvo in aws_acm_certificate.frontend[0].domain_validation_options : dvo.domain_name => {
      name   = dvo.resource_record_name
      record = dvo.resource_record_value
      type   = dvo.resource_record_type
    }
  } : {}

  allow_overwrite = true
  name            = each.value.name
  records         = [each.value.record]
  ttl             = 60
  type            = each.value.type
  zone_id         = var.route53_zone_id
}

resource "aws_acm_certificate_validation" "frontend" {
  provider = aws.us_east_1

  count = var.domain_name != "" && var.route53_zone_id != "" ? 1 : 0

  certificate_arn         = aws_acm_certificate.frontend[0].arn
  validation_record_fqdns = [for record in aws_route53_record.acm_validation : record.fqdn]
}
