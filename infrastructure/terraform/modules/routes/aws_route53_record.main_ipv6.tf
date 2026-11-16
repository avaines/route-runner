resource "aws_route53_record" "main_ipv6" {
  name    = local.domain_name
  type    = "AAAA"
  zone_id = data.aws_route53_zone.main.zone_id
  alias {
    evaluate_target_health = false
    name                   = aws_cloudfront_distribution.app.domain_name
    zone_id                = aws_cloudfront_distribution.app.hosted_zone_id
  }
}
