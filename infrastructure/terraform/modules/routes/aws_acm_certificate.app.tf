resource "aws_acm_certificate" "app" {

  provider                  = aws.us_east_1
  domain_name               = local.domain_name
  subject_alternative_names = local.alias_domain_names
  validation_method         = "DNS"
  tags                      = local.default_tags
  lifecycle { create_before_destroy = true }
}
resource "aws_route53_record" "validation" {
  for_each = {
    for option in aws_acm_certificate.app.domain_validation_options : option.domain_name => option
  }
  zone_id = data.aws_route53_zone.main.zone_id
  name    = each.value.resource_record_name
  type    = each.value.resource_record_type
  records = [each.value.resource_record_value]
  ttl     = 60
}
resource "aws_acm_certificate_validation" "app" {

  provider                = aws.us_east_1
  certificate_arn         = aws_acm_certificate.app.arn
  validation_record_fqdns = [for record in aws_route53_record.validation : record.fqdn]
}
