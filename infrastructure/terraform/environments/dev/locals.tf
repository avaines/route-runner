locals {
  aws_account_id = var.aws_account_id

  aws = {
    account_id   = local.aws_account_id
    default_tags = local.default_tags
    region       = var.region
  }

  unique_id = replace(
    format(
      "%s",
      var.environment
    ),
    "_",
    "",
  )

  unique_id_account = replace(
    format(
      "%s-%s",
      var.environment,
      var.region,
    ),
    "_",
    "",
  )

  unique_id_global = replace(
    format(
      "%s-%s-%s",
      local.aws_account_id,
      var.region,
      var.environment,
    ),
    "_",
    "",
  )

  default_tags = merge(
    var.default_tags,
    {
      "Name"           = local.unique_id
      "tf:environment" = var.environment
    }
  )
}
