# Workflows

`deploy.yml` deploys same-repository pull requests and manual dev runs to the
`dev` environment. Pushes to `main` and manual prod runs deploy to `prod`. Both
jobs run the checks and frontend build before applying Terraform, uploading the
static build, and invalidating CloudFront.

Before enabling deployments:

- Configure GitHub Environments named `dev` and `prod`. Require reviewers for
  `prod` and add an environment secret named `AWS_ROLE_ARN` to each.
- Configure each AWS role to trust GitHub Actions OIDC for this repository and
  the matching environment, with only the permissions needed by that Terraform
  root and frontend bucket.
- Set `AWS_REGION`, `NODE_VERSION`, `PYTHON_VERSION`, and `TERRAFORM_VERSION` in
  `deploy.yml` to the project's supported versions and region.
- Configure remote Terraform state and the backend values in each environment
  root. Verify each root exposes `portal_bucket` and
  `cloudfront_distribution_id` outputs before enabling the workflow.
- Add the frontend package lockfile and make sure its lint, test, and build
  scripts exist. Update the composite action if the project uses different
  validation or deployment commands.

The workflow runs `terraform apply -auto-approve` after checks pass. Dev deploys
can run automatically for same-repository pull requests; production deployments
should be protected by required GitHub Environment reviewers. Review the
workflow conditions, OIDC trust policy, and Terraform plan behavior before
turning on deployment for a new repository.

Do not copy credentials into workflow files. Keep deployment roles least
privileged and do not add a teardown workflow without a separate, explicit
confirmation gate.
