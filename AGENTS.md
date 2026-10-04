# Agent Instructions

## Before Making Changes

- Read this file and the relevant project documentation in `docs/` and nearby
  directories before editing.
- Treat the repository README and specification as the source of truth for
  product behavior. Ask for clarification when a requested change conflicts
  with them or leaves a consequential behavior undefined.
- Inspect the existing implementation and tests before choosing where a change
  belongs. Follow local conventions and keep changes scoped to the request.

## Engineering Practices

- Prefer the smallest change that fixes the root cause. Preserve public APIs and
  established behavior unless the task explicitly changes them.
- Add or update focused tests for behavior changes. Run the narrowest relevant
  checks, then any required project-wide checks.
- Never commit credentials, tokens, private keys, `.env` files, Terraform state,
  or generated deployment artifacts.
- Keep reusable Terraform modules independent of environment-specific values.
  Review plans carefully and verify the selected AWS account and environment.
- Do not run `terraform apply`, deploy workflows, destructive cloud operations,
  or production changes without explicit user authorization.
- Do not commit changes or create branches unless explicitly requested.

## Terraform Structure and Naming

- Keep `infrastructure/terraform/environments/<environment>/` roots generic and
  portable. They should configure the backend, required providers and versions,
  provider settings, variables, locals, outputs, environment values, and module
  calls; put application resources in reusable modules.
- Name module call files `module.<name>.tf` (for example,
  `module.application.tf`). Keep environment-specific values in the environment
  configuration and pass them to modules through declared inputs.
- Put resource and data-source definitions under
  `infrastructure/terraform/modules/<module>/`. Prefer focused filenames based
  on the Terraform type and purpose, such as
  `aws_lambda_function.api.tf` or
  `data.aws_iam_policy_document.api_assume_role.tf`.
- Do not use `main.tf` as a catch-all. Keep `locals.tf`, `variables.tf`,
  `outputs.tf`, and `versions.tf` for their respective declarations. Split
  unrelated resources or data sources into separate, descriptively named files.
- Keep tightly coupled resources together when that clarifies ownership, such as
  a singleton IAM role and its specific assume-role policy document and policy
  attachment. Do not force one-resource-per-file when a small cohesive group
  belongs together.
- Follow the established naming and file layout in the target module when
  extending an existing project; do not rename unrelated files as cleanup.

## Lambda Functions

- Keep each deployable function's source and focused tests together under
  `infrastructure/lambdas/`. Put genuinely shared code in an explicit shared
  package rather than copying it between functions.
- Keep the Lambda entry point responsible for translating the event into the
  application's request/response contract. Put non-trivial business rules in
  code that can be exercised without invoking the AWS runtime.
- Read configuration from environment variables, validate required values, and
  avoid hard-coding account-, region-, or environment-specific settings.
- Make external dependencies replaceable in unit tests where practical. Test
  success, invalid input, expected service failures, and boundary conditions
  without requiring live AWS resources; use deterministic clocks or generated
  values when they affect behavior.
- Reuse AWS SDK clients across invocations where appropriate, but do not retain
  mutable request-specific state in module globals.
- Preserve the existing package and runtime conventions. Before changing
  packaging or dependencies, verify that the deployment artifact contains the
  handler and required runtime dependencies.

## Frontend Implementation

- Follow the existing frontend structure. Keep API calls and their request,
  response, and error types at a clear boundary instead of duplicating fetch
  logic across views.
- Represent loading, empty, success, and error states explicitly for async user
  workflows. Keep validation consistent with the server-side contract; client
  validation improves feedback but does not replace server validation.
- Use semantic HTML, associated labels, accessible names, and appropriate live
  announcements for dynamic status or errors. Preserve the existing responsive
  layout and design system when extending the frontend.
- Test observable user workflows with the project's existing test stack. Prefer
  role- and label-based queries and realistic user interactions; mock network
  boundaries rather than testing component implementation details.
- Keep components focused as features grow. Avoid adding memoization or shared
  abstractions without a demonstrated need, and follow the React and TypeScript
  conventions already configured in the project.

## Reporting

- Summarize what changed and what was validated.
- Call out checks that could not be run and any remaining operational steps.
