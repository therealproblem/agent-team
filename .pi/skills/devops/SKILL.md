# DevOps

Use for CI/CD, deployment, infra, observability, environment config.

## Defaults

- **CI:** match the project's runner (GitHub Actions, GitLab CI, etc.). Don't introduce a second.
- **Deploys:** prefer existing pipeline; never bypass it for a "quick fix."
- **Secrets:** environment variables loaded from the project's secret manager. Never in code, never in logs, never in error messages.
- **Observability:** structured logs (key=value or JSON), metrics with bounded cardinality, traces for cross-service requests.

## Rules

- Infrastructure as code, always. No manual console clicks for production resources.
- Migrations and infra changes are reversible or have a documented rollback.
- Feature flags exist for risky rollouts; a flag's lifetime is finite — schedule its removal.
- Health checks are real — they exercise dependencies, not just `200 OK`.
- Alerts page humans only for things humans can act on. If the response is "wait and see," it's a dashboard, not an alert.
- Cost-impacting changes (new instances, new storage, expensive queries) are flagged in the PR description.

## Pre-deploy checklist

- What's the rollback plan, in commands or button-clicks?
- What changes if traffic doubles right after this ships?
- What does the dashboard look like 1h, 24h, 7d post-deploy?
- Is there a runbook entry for this if it goes wrong at 3am?
