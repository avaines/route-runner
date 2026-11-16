locals {
  module = "routes"

  unique_id         = var.unique_ids["local"]
  unique_id_account = var.unique_ids["account"]
  unique_id_global  = var.unique_ids["global"]

  route53_zone_name = trimsuffix(var.route53_zone_name, ".")
  domain_name       = trimsuffix(var.domain_root, ".")

  alias_domain_names = sort(distinct([
    for name in var.alias_domain_names : trimsuffix(name, ".")
    if trimsuffix(name, ".") != local.domain_name
  ]))

  resource_prefix        = lower(replace(local.unique_id_account, "_", "-"))
  global_resource_prefix = lower(replace(local.unique_id_global, "_", "-"))

  lambdas_path = abspath("${path.module}/../../../lambdas")

  default_tags = merge(
    var.default_tags,
    {
      "Name"      = local.unique_id
      "tf:module" = local.module
    },
    length(var.module_parents) == 0 ? {} : {
      "tf:module:parents" = join(":", var.module_parents)
    }
  )
}
