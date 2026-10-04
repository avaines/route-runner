# Checks and deployment

CI runs package checks/builds and Terraform validation without AWS credentials.
Deployment is **manual only**, from `main`, and supports dev only. The plan job
builds an immutable release, saves a binary plan and human-readable review, then
the protected `dev` environment gates applying that exact plan. Never approve an
unreviewed plan. A changed state requires another run; do not replace its plan.

Before dispatching, configure GitHub environments:

- `dev-plan`: plan-only OIDC role in secret `AWS_ROLE_ARN`, including state
  locking/read and infrastructure describe permissions.
- `dev`: deployment OIDC role in secret `AWS_ROLE_ARN`; **require reviewers** and
  restrict deployment branches to `main`. Without reviewers GitHub does not pause.
- Both: variables `AWS_REGION`, `AWS_ACCOUNT_ID` (the intended account). Plan:
  `TF_VARS_JSON`, containing non-secret Terraform environment configuration, and
  `GOOGLE_MAPS_PARAMETER_NAME`, containing the Terraform `google_maps_parameter_name` output. The plan role needs `ssm:GetParameter` on that parameter. The workflow retrieves and masks the key before building.

OIDC trust must scope `aud` to `sts.amazonaws.com` and `sub` to the actual
`repo:OWNER/REPO:environment:dev-plan` or `:environment:dev`. Bootstrap these roles
and the encrypted, locking state backend separately. No long-lived AWS keys.
Restrict IAM permissions to this environment; deployment also needs Lambda, S3
uploads and CloudFront invalidation. The backend and local dev.auto.tfvars are
operator-owned; the latter is ignored and therefore CI needs TF_VARS_JSON.

Example non-secret TF_VARS_JSON shape (substitute confirmed values):

```json
{"environment":"dev","aws_account_id":"YOUR_ACCOUNT_ID","region":"YOUR_REGION","alert_email":"YOUR_EMAIL"}
```

Builds include the Lambda zip and frontend; artifacts last 30 days. Keep the last
successful release and retain artifacts externally if longer rollback is needed.
S3 versioning preserves HTML versions and uploads never delete old hashed assets.
To roll back, download the previous successful release, use its Lambda zip as the
new deployment input, review a fresh Terraform plan, then restore its frontend
assets followed by index.html and invalidate `/` and `/index.html`. Never apply an
old saved plan to roll back infrastructure. Terraform publishes Lambda versions
but currently uses `$LATEST` for the URL. Rollback and origin-access smoke checks
must be demonstrated in dev before release.

Plans can contain infrastructure metadata: keep artifact/repository access scoped.
No routing key belongs in GitHub variables, build variables, or Terraform inputs;
populate the Terraform-created SSM Parameter Store SecureString using the
`routing_parameter_name` output, with the default `aws/ssm` encryption key. Confirm the SNS email
subscription. Configure billing alerts separately using user-approved thresholds.

First deployment: build the Lambda and provision the infrastructure through a
reviewed local Terraform plan/apply, then populate both SSM parameters. The
application workflow requires the Google parameter to exist and contain a real
key before it can build. Ordinary CI remains keyless. The browser key appears
in the published bundle by design; restrict it to Maps JavaScript API and the
allowed website referrers.
