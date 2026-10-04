terraform {
  backend "s3" {
    bucket = "terraform-804221019544-state"
    # key          = "CHANGEME/dev/terraform.tfstate"
    region       = "us-east-1"
    use_lockfile = true
  }
}
