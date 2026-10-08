resource "aws_ssm_parameter" "google_maps" {
  name        = "/${local.resource_prefix}/google-maps-api-key"
  description = "Restricted Google Maps JavaScript browser key; populate before frontend deployment"
  type        = "SecureString"
  tier        = "Standard"

  # Bootstrap only; the deployment workflow rejects this placeholder.
  value_wo         = "UNSET"
  value_wo_version = 1
  tags             = local.default_tags

  lifecycle {
    prevent_destroy = true
    ignore_changes  = [value_wo_version]
  }
}
