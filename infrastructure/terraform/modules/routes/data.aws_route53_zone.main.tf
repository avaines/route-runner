data "aws_route53_zone" "main" {
  count        = var.enable_custom_domain ? 1 : 0
  name         = var.route53_zone_id == null ? "${local.route53_zone_name}." : null
  private_zone = false
  zone_id      = var.route53_zone_id
}
