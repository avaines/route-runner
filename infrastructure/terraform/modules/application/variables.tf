variable "aws" {
  type = object({
    account_id   = string
    default_tags = optional(map(string), {})
    region       = string
  })
}

variable "module_parents" {
  type        = list(string)
  description = "Parent module names"
  default     = []
}

variable "unique_ids" {
  type = object({
    local   = optional(string, null)
    account = optional(string, null)
    global  = optional(string, null)
  })
}

variable "default_tags" {
  type        = map(string)
  description = "Tags applied to taggable resources"
  default     = {}
}

variable "environment" {
  type        = string
  description = "Environment name"
}

variable "domain_root" {
  type        = string
  description = "Public application domain"
}

variable "alias_domain_names" {
  type        = list(string)
  description = "Additional domains for the same CloudFront distribution"
  default     = []
}

variable "route53_zone_name" {
  type        = string
  description = "Route 53 hosted zone containing the public domain"
}

variable "route53_zone_id" {
  type        = string
  description = "Optional Route 53 hosted zone ID"
  default     = null
}

variable "lambda_runtime" {
  type        = string
  description = "Python runtime used by Lambda functions"
  default     = "python3.14"
}

variable "cloudwatch_log_retention_days" {
  type        = number
  description = "CloudWatch Logs retention period"
  default     = 30
}
