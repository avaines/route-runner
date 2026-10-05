# Checks, deployment and dev cleanup

| Event | Action |
| --- | --- |
| Same-repository PR to main opened, reopened or updated | Build, plan and deploy dev |
| Push to main | Build, plan and deploy prod |
| Manual deploy | Choose dev or prod |
| Same-repository PR merged into main | Destroy dev application infrastructure; retain both SSM keys |
| PR closed without merging, or fork PR | No cloud deployment or cleanup |
| Manual destroy-dev | Requires typing `confirm`; always dev |

CI runs package checks/builds, dev Terraform
validation without AWS credentials. Cloud jobs use OIDC. Dev deploy and cleanup
share `route-runner-dev` concurrency and do not interrupt an active Terraform run.
A queued PR deploy rechecks whether the PR is still open before building, so a
closed PR does not recreate dev after cleanup. Dev is one shared environment,
not one environment per PR: merging one PR tears down the shared dev app.

## GitHub setup

Configure `dev-plan` and `dev` for current development. Production infrastructure
is intentionally absent; the prod selector and main-push job remain placeholders
and are expected to fail until a release is agreed. `prod-plan` and `prod` setup
below applies only to that future release:

- Each has secret `AWS_ROLE_ARN` and variables `AWS_REGION`, `AWS_ACCOUNT_ID`.
- Plan environments need access to the existing `GOOGLE_MAPS_API_KEY` GitHub Actions secret.
- Plan roles need state read and locking and infrastructure describe permissions.
- Deploy roles need infrastructure write permissions. Dev also needs teardown
  permissions, including deletion of all versions in the frontend bucket.
- Configure required reviewers on `prod` to review the uploaded saved plan before
  it is applied. Dev reviewers are optional; omit them for automatic PR deployment
  and merge cleanup. Restrict prod/prod-plan branches to main; permit same-repository
  PR deployments in dev/dev-plan.

Scope OIDC trust to the actual repository and each environment, e.g.
`repo:OWNER/REPO:environment:dev`, with audience `sts.amazonaws.com`.
No long-lived AWS access keys are required. Terraform loads committed non-secret
`dev.auto.tfvars` and `prod.auto.tfvars` from their respective environment folders.
No `TF_VARS_JSON` GitHub variable or generated tfvars file is needed. Production
infrastructure remains unimplemented until a release is agreed.

## API keys

Terraform creates both SSM SecureString parameters with `UNSET` placeholders.
Populate both with plain API keys manually after initial provisioning. Both have
`prevent_destroy = true` and preserve manual value changes.

The frontend build uses `${{ secrets.GOOGLE_MAPS_API_KEY }}` directly. Both keys
are already available as GitHub Actions secrets and in AWS SSM; CI does not copy,
fetch or populate them in SSM. It does not need the routing key for offline tests
or packaging. Deployed Lambda reads the routing key from SSM. Local development
uses `.env.local`.

A full destroy plan is blocked by `prevent_destroy` once the parameters exist;
the cleanup workflow does not bypass that protection.

Cleanup first updates the existing dev bucket's `force_destroy` flag with a targeted
saved plan, then removes application infrastructure using a saved destroy plan.
This handles buckets from earlier builds where the flag was false and ensures
object versions/delete markers do not block teardown. Production defaults to
`force_destroy=false` and has no destroy workflow. No teardown is executed locally
as part of validating these workflow files.

## Plans, publishing and rollback

The plan job uploads the binary plan, readable plan, Lambda zip, frontend build. The deploy job applies that exact plan and
uploads immutable assets before index.html. It never deletes old assets during
normal deployment. Artifacts are retained for 30 days; save successful releases
externally for longer retention. Plans contain infrastructure metadata, so restrict
artifact access. A stale plan requires a fresh workflow run.

For rollback, use the previous successful Lambda package as input to a fresh
reviewed Terraform plan, then publish that release's frontend assets and HTML and
invalidate `/` and `/index.html`. Do not apply an old saved plan to roll back.
Rollback, CloudFront signing, origin access and live merge cleanup still need
verification in the configured GitHub/AWS environment.
