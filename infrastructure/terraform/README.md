# Terraform

The reusable `routes` module owns private S3 storage, CloudFront, a Node.js 22
Lambda Function URL, scoped SSM Parameter Store access and CloudWatch/SNS
alerts. Roots contain only environment values and wiring. Terraform 1.14.3 and AWS
provider 6.50.0/archive 2.7.1 are pinned; include the provider lockfile in review.

Build the Lambda before planning:

```sh
npm --prefix infrastructure/lambdas ci
npm --prefix infrastructure/lambdas run build
terraform -chdir=infrastructure/terraform/environments/dev init -backend=false
terraform -chdir=infrastructure/terraform/environments/dev validate
```

The backend and committed non-secret environment `.auto.tfvars` files are operator-owned. The
configured region is preserved; do not infer a deployment region from the state
bucket region. Verify the account and region before an authorised plan against
AWS. An account allowlist guards both regional and us-east-1 certificate providers.
Do not apply without explicit authorisation and a reviewed plan.

DNS and the ACM certificate are configured from `domain_root`,
`route53_zone_name` (or `route53_zone_id`), and `alias_domain_names`.
Certificate validation runs in us-east-1.

DNS follows the quiz module layout: `aws_route53_record.main.tf` and
`main_ipv6.tf` create the primary A/AAAA records from `domain_root`;
`aliases.tf` and `aliases_ipv6.tf` create A/AAAA records for each entry in
`alias_domain_names`. All records alias the CloudFront distribution.
Allow the deployed hostname in the Google Maps browser key's HTTP referrers.

The API origin request policy forwards all viewer headers except `Host`, using
CloudFront's `allExcept` mode. This includes `Content-Type` and the browser's
`x-amz-content-sha256` payload hash; CloudFront rejects an explicit allowlist
containing that hash header. The origin receives the Lambda URL's Host header.
Cookies and query strings are still excluded and all API cache TTLs are zero.
This uses the header behaviour of AWS's
[AllViewerExceptHostHeader policy](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/using-managed-origin-request-policies.html#managed-origin-request-policy-all-viewer-except-host-header)
without that managed policy's cookie/query forwarding. Verify signed POSTs after
applying: local Terraform validation does not exercise CloudFront API restrictions.

Terraform creates both API-key SSM SecureString parameters with write-only `UNSET`
placeholders. Populate their plain values manually. `prevent_destroy = true`
protects both resources, and the unchanged write-only version preserves manual
updates. CI builds with the Google Maps GitHub secret; Lambda reads the routing key from SSM.
A full destroy plan will fail while these protected parameters are present.

`api_environment` accepts non-secret configuration only;
backend README lists supported variables. Keep REQUEST_DEADLINE_MS below the
25-second Lambda timeout; origin timeout is 30 seconds. Reserved concurrency is
2; setting `lambda_reserved_concurrency=0` through an authorised change halts
all generation. To disable immediately, an operator can use Lambda concurrency
controls and then reconcile Terraform. No provisioned concurrency, VPC/NAT,
provider caching, access logging, WAF or billing budget is created.

SNS email confirmation and separately approved billing notifications are required
operational setup. Lambda platform errors and throttles alarm after two of three
one-minute periods; application-level provider errors remain JSON responses and
must also be monitored via structured application logs.

After the first authorised deployment, verify:

1. Health and hashed POST through CloudFront work; missing/mismatched body hashes
   and direct unsigned Lambda URL requests fail.
2. Anonymous S3 access fails; API errors remain JSON, with no-store headers.
3. A routing secret never appears in frontend bundles or routine logs.
4. A previous release can be restored, and concurrency zero stops requests.

No live-provider suitability, deployed signing, rollback or performance claim is
established by local Terraform validation. See workflow README for plan approval,
OIDC setup and release retention. AWS requirements checked against:
https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-restricting-access-to-lambda.html
and the AWS provider v6.50.0 lambda_permission documentation.

## Environment roots and teardown

Only `environments/dev` is implemented. The production directory remains a
placeholder until a release is agreed; selecting prod is expected to fail.

The module's `frontend_bucket_force_destroy` defaults to false. The dev root
defaults it to true so authorised ephemeral teardown can remove all frontend
objects, versions and delete markers. Production defaults to false, preventing
deletion of a nonempty frontend bucket unless explicitly overridden. This option
does not itself initiate teardown. A bucket provisioned with false must first
receive an authorised apply updating that setting before automatic deletion can
use it; a destroy plan alone does not update the stored setting.
