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
  description = "Node.js runtime used by Lambda functions"
  default     = "nodejs22.x"
}

variable "cloudwatch_log_retention_days" {
  type        = number
  description = "CloudWatch Logs retention period"
  default     = 14
}

variable "enable_custom_domain" {
  type    = bool
  default = false
}
variable "alert_email" {
  type    = string
  default = null
}
variable "lambda_reserved_concurrency" {
  type    = number
  default = 2
  validation {
    condition     = var.lambda_reserved_concurrency >= 0 && floor(var.lambda_reserved_concurrency) == var.lambda_reserved_concurrency
    error_message = "Concurrency must be a non-negative integer; zero is the kill switch."
  }
}
variable "api_environment" {
  description = "Non-secret backend configuration overrides. Never pass credentials here."
  type        = map(string)
  default     = {}
  validation {
    condition = alltrue([
      for key in keys(var.api_environment) : !can(regex("(?i)(secret|token|password|api.?key|credential)", key))
    ])
    error_message = "Credentials and secret settings must use SSM Parameter Store, not environment override inputs."
  }
}

variable "frontend_bucket_force_destroy" {
  type        = bool
  description = "Allow removal of all frontend object versions when destroying the bucket."
  default     = false
}
