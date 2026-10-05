module "routes" {
  source = "../../modules/routes"

  providers = {
    aws           = aws
    aws.us_east_1 = aws.us_east_1
  }

  aws = local.aws

  unique_ids = {
    local   = "${local.unique_id}-route-runner"
    account = "${local.unique_id_account}-route-runner"
    global  = "${local.unique_id_global}-route-runner"
  }

  default_tags   = local.default_tags
  module_parents = [var.environment]

  environment = var.environment

  domain_root       = var.domain_root
  route53_zone_id   = var.route53_zone_id
  route53_zone_name = var.route53_zone_name

  alert_email = var.alert_email

  frontend_bucket_force_destroy = var.frontend_bucket_force_destroy
}
