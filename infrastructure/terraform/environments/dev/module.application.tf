module "application" {
  source = "../../modules/application"

  providers = {
    aws           = aws
    aws.us_east_1 = aws.us_east_1
  }

  aws = local.aws

  unique_ids = {
    local   = "${local.unique_id}-the-room-said"
    account = "${local.unique_id_account}-the-room-said"
    global  = "${local.unique_id_global}-the-room-said"
  }

  default_tags   = local.default_tags
  module_parents = ["dev"]

  environment        = var.environment
  alias_domain_names = var.alias_domain_names
}
