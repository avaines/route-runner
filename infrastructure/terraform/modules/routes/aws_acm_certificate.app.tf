resource "aws_acm_certificate" "app" {
  count                     = var.enable_custom_domain ? 1 : 0
  provider                  = aws.us_east_1
  domain_name               = local.domain_name
  subject_alternative_names = local.alias_domain_names
  validation_method         = "DNS"
  tags                      = local.default_tags
  lifecycle { create_before_destroy = true }
}
resource "aws_route53_record" "validation" {
  for_each = var.enable_custom_domain ? {
    for option in aws_acm_certificate.app[0].domain_validation_options : option.domain_name => option
  } : {}
  zone_id = data.aws_route53_zone.main[0].zone_id
  name    = each.value.resource_record_name
  type    = each.value.resource_record_type
  records = [each.value.resource_record_value]
  ttl     = 60
}
resource "aws_acm_certificate_validation" "app" {
  count                   = var.enable_custom_domain ? 1 : 0
  provider                = aws.us_east_1
  certificate_arn         = aws_acm_certificate.app[0].arn
  validation_record_fqdns = [for record in aws_route53_record.validation : record.fqdn]
}
resource "aws_route53_record" "app" {
  for_each = var.enable_custom_domain ? toset(concat([local.domain_name], local.alias_domain_names)) : toset([])
  zone_id  = data.aws_route53_zone.main[0].zone_id
  name     = each.value
  type     = "A"
  alias {
    name                   = aws_cloudfront_distribution.app.domain_name
    zone_id                = aws_cloudfront_distribution.app.hosted_zone_id
    evaluate_target_health = false
  }
}
