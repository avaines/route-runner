variable "aws_account_id" {
  type        = string
  description = "AWS Account IDs for the account that will be used by providers"
}

variable "region" {
  type        = string
  description = "The AWS Region"
}

variable "environment" {
  type        = string
  description = "Environment name"
}

variable "default_tags" {
  type        = map(string)
  description = "A map of default tags to apply to all taggable resources within the component"
  default     = {}
}

##
# Variables specific to this Component
##

variable "alert_email" {
  type        = string
  description = "Email address for CloudWatch alarm SNS notifications"
}

variable "domain_root" {
  type        = string
  description = "Public app domain for this environment (e.g. lynx.example.com)"
  default     = "lynx.example.com"
}

variable "alias_domain_names" {
  type        = list(string)
  description = "Additional public app domains to alias to the same CloudFront distribution"
  default     = []
}

variable "route53_zone_name" {
  type        = string
  description = "Route 53 hosted zone that contains the public app domain"
}

variable "route53_zone_id" {
  type        = string
  description = "Route 53 hosted zone ID that contains the public app domain"
  default     = null
}
