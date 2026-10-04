# Terraform

- `environments/` contains independent root configurations and environment
  values.
- `modules/` contains reusable infrastructure implementations.

Keep state remote and isolated per environment. Do not commit state, plans, or
secret values. Document required providers, backend setup, input sources, and
approval steps before the first apply.
