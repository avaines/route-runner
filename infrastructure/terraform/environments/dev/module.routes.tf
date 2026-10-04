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
  module_parents = ["dev"]

  environment                 = var.environment
  alias_domain_names          = var.alias_domain_names
  domain_root                 = var.domain_root
  route53_zone_name           = var.route53_zone_name
  route53_zone_id             = var.route53_zone_id
  enable_custom_domain        = var.enable_custom_domain
  alert_email                 = var.alert_email
  lambda_reserved_concurrency = var.lambda_reserved_concurrency
  api_environment             = var.api_environment
}
