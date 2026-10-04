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

The existing dev backend and local dev.auto.tfvars remain operator-owned. The
configured region is preserved; do not infer a deployment region from the state
bucket region. Verify the account and region before an authorised plan against
AWS. An account allowlist guards both regional and us-east-1 certificate providers.
Do not apply without explicit authorisation and a reviewed plan.

`enable_custom_domain=false` uses the CloudFront hostname without DNS lookup or
certificate creation. Enable it only after confirming domain_root,
route53_zone_name (or route53_zone_id), and aliases. Certificate validation runs
in us-east-1. The initial frontend uses no path-based SPA fallback, so API errors
cannot be turned into HTML.

The API origin request policy forwards all viewer headers except `Host`, using
CloudFront's `allExcept` mode. This includes `Content-Type` and the browser's
`x-amz-content-sha256` payload hash; CloudFront rejects an explicit allowlist
containing that hash header. The origin receives the Lambda URL's Host header.
Cookies and query strings are still excluded and all API cache TTLs are zero.
This uses the header behaviour of AWS's
[AllViewerExceptHostHeader policy](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/using-managed-origin-request-policies.html#managed-origin-request-policy-all-viewer-except-host-header)
without that managed policy's cookie/query forwarding. Verify signed POSTs after
applying: local Terraform validation does not exercise CloudFront API restrictions.

Terraform creates the `routing_parameter_name` output as an SSM **SecureString**
using the default `aws/ssm` encryption key. It starts with a write-only
`UNCONFIGURED` placeholder, which Lambda rejects until populated. Set the plain ORS
API key, without JSON wrapping, securely in Parameter Store after provisioning.
`value_wo` keeps values out of Terraform state; the unchanged write-only version
preserves subsequent operator updates. Do not increment it to rotate the key.
The parameter's name is `/<resource-prefix>/routing-api-key`.

If you already created this parameter manually, import it into
`module.routes.aws_ssm_parameter.routing` before applying rather than overwriting
it. Review the plan to ensure no value update or parameter replacement is planned.
Lambda receives `ROUTING_PARAMETER_NAME` and has `ssm:GetParameter` permission
only for that parameter. Custom KMS keys need separate decrypt permissions.

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

The second SecureString, `google_maps_parameter_name`, holds the restricted Google
Maps JavaScript browser key. Replace its `UNCONFIGURED` placeholder after initial
provisioning. Set the GitHub dev-plan variable `GOOGLE_MAPS_PARAMETER_NAME` to its
name; deployment reads it before the frontend build. Lambda needs only the routing
parameter and is not granted access to the Google parameter. Both use write-only
bootstrap values so real keys stay out of Terraform state. Local development
continues to use the frontend `.env.local` file.
