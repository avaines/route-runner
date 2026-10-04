# Route Runner

A mobile-friendly running route planner: choose a start, an approximate distance
and a hill preference, then inspect up to three circular routes on Google
satellite imagery.

Routes use roads and paths. Hill preferences are relative to the generated
candidates, and map data does not establish current access or surface conditions.
There is no live navigation, route export, account system or cloud synchronisation.

## Project layout

| Directory | Purpose |
| --- | --- |
| `infrastructure/frontend/` | Vite, React and TypeScript browser application |
| `infrastructure/lambdas/` | TypeScript routing API, provider adapter and tests |
| `packages/contracts/` | Shared runtime validation and API types |
| `infrastructure/terraform/` | Environment configuration and reusable AWS resources |
| `.github/workflows/` | Validation and operator-controlled deployment |
| `docs/` | Specification, architecture and release validation |

## Local development

Use Node.js 22.22.0 (pinned in `.nvmrc` and CI) and npm. Install each application's locked dependencies:

```sh
npm --prefix infrastructure/lambdas ci
npm --prefix infrastructure/frontend ci
```

Start the sample-data backend and frontend in separate terminals:

```sh
npm --prefix infrastructure/lambdas run dev
```

```sh
npm --prefix infrastructure/frontend run dev
```

See the [frontend instructions](infrastructure/frontend/README.md) for map-key
configuration and sample mode, and the [backend instructions](infrastructure/lambdas/README.md)
for provider configuration. Local sample geometry demonstrates application
behaviour; it is not a runnable route or a validation of provider quality.

The routing credential belongs only in backend configuration or AWS SSM
Parameter Store. The Google browser key is public and must have website/API restrictions.
Never commit credentials or local environment files.

## Checks

```sh
npm --prefix infrastructure/lambdas run typecheck
npm --prefix infrastructure/lambdas test
npm --prefix infrastructure/lambdas run build
npm --prefix infrastructure/frontend run lint
npm --prefix infrastructure/frontend test
npm --prefix infrastructure/frontend run build
terraform fmt -check -recursive infrastructure/terraform
```

Terraform validation and deployment preparation are documented in the
[Terraform guide](infrastructure/terraform/README.md). Deployment roles and
workflow inputs are documented in the [workflow guide](.github/workflows/README.md).

## Hosting and release

The frontend is served from a private S3 bucket through CloudFront. `/api/*`
forwards to an IAM-protected Lambda Function URL using CloudFront origin access
control. The browser hashes POST bodies for origin signing; no AWS credentials
are exposed. The API is public through CloudFront unless a separate authentication
design is added. Routing credentials are stored in SSM Parameter Store.

The dev backend configuration is already supplied. Verify the AWS account and
application region separately before planning. The remote state region does not
determine the application's region. Custom DNS is optional.

Live provider compatibility, West Yorkshire route quality, provider terms,
Google configuration and deployed security checks remain release gates. Use the
[release checklist](docs/RELEASE_CHECKLIST.md) before operating the app with real
provider credentials or publishing it. Deployment is an explicit operator step.

## Design

- [Product specification](docs/SPECIFICATION.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Routing model and calibration](docs/ROUTING.md)
- [API contract](packages/contracts/openapi.yaml)
- [Local validation results](docs/VALIDATION.md)
- [Release validation](docs/RELEASE_CHECKLIST.md)
