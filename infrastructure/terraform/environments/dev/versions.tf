terraform {
  required_version = ">= 1.14.3, < 2.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "= 6.50.0"
    }
    archive = {
      source  = "hashicorp/archive"
      version = "= 2.7.1"
    }
  }
}
