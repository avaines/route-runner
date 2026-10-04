# Project Name

> One-sentence description of the project and who it is for.

Replace the placeholders in this repository before using it. Keep this README
focused on what the project does and the commands contributors need to build,
test, and deploy it.

## Repository Layout

```text
.
├── .github/workflows/       # CI and deployment workflows
├── infrastructure/
│   ├── frontend/            # Vite + React + TypeScript application
│   ├── lambdas/             # Python Lambda workspace and tests
│   └── terraform/
│       ├── environments/    # Per-environment Terraform roots
│       └── modules/         # Reusable infrastructure modules
└── docs/                    # Architecture, specification, and decisions
```

Adapt or remove components that the project does not need. Keep environment
configuration separate from reusable Terraform modules, and keep application
code and infrastructure in their respective directories.

## Getting Started

### Prerequisites

- AWS CLI configured for the intended account and role
- Terraform (record the supported version here)
- Python (record the supported version here) and [uv](https://docs.astral.sh/uv/)
- Node.js (record the supported version here) and npm

### Frontend

```sh
cd infrastructure/frontend
npm install
npm run dev
```

Document required local environment variables in
`infrastructure/frontend/.env.example`. Never commit real credentials or
environment files containing secrets.

### Lambda Functions

```sh
cd infrastructure/lambdas
uv sync
make test
make lint
```

Add each function as a package with its own source and tests. Document any
packaging or runtime verification commands provided by the project.

### Terraform

Initialize and validate from the selected environment root:

```sh
terraform -chdir=infrastructure/terraform/environments/dev init
terraform -chdir=infrastructure/terraform/environments/dev validate
terraform -chdir=infrastructure/terraform/environments/dev plan
```

Review the plan and confirm the AWS account, workspace, and environment before
applying changes. Add production instructions only after the production setup is
defined.

## Validation

Replace these examples with the commands configured by the project:

```sh
npm --prefix infrastructure/frontend run lint
npm --prefix infrastructure/frontend test
npm --prefix infrastructure/frontend run build
make -C infrastructure/lambdas test
make -C infrastructure/lambdas lint
terraform fmt -check -recursive infrastructure/terraform
```

## Deployment

The starter deployment workflow is in `.github/workflows/deploy.yml`. Configure
the GitHub environments, OIDC roles, Terraform outputs, and version values
described in [.github/workflows/README.md](.github/workflows/README.md) before
enabling deployments. Review CI triggers, rollback procedure, and post-deployment
checks for the project. Do not add real account IDs, role ARNs, tokens, or secret
values to this repository.

## Project Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Specification](docs/SPECIFICATION.md)
