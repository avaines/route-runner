resource "aws_ssm_parameter" "routing" {
  name        = local.routing_parameter_name
  description = "openrouteservice API key; populate securely after provisioning"
  type        = "SecureString"
  tier        = "Standard"

  # Bootstrap only; the deployment workflow rejects this placeholder.
  value_wo         = "UNSET"
  value_wo_version = 1

  tags = local.default_tags

  lifecycle {
    prevent_destroy = true
    # Retain subsequent out-of-band credential updates on future applies.
    ignore_changes = [value_wo_version]
  }
}
