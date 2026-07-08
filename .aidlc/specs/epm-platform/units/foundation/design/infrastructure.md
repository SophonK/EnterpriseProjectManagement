# Foundation — Infrastructure Design (expanded)

Deployment architecture and mapping of logical components to actual services. Detailed cloud provisioning (IaC) is finalized in the **Operations** phase; this establishes the target shape.

## Deployment Architecture
```
                 ┌────────────────────────┐
   Users ──TLS──▶│  Web app (separate repo)│  (React, static hosting/CDN)
                 └───────────┬────────────┘
                             │ HTTPS /api/v1
                             ▼
                 ┌────────────────────────┐        ┌──────────────────┐
                 │  API (Modular Monolith)│──OIDC──▶│ Enterprise IdP   │
                 │  NestJS container      │◀─JWKS───│ (SAML/OIDC)      │
                 │  (rolling, N replicas) │        └──────────────────┘
                 └───────┬────────┬───────┘
                         │        │
                  Prisma │        │ Outbox relay (in-process worker)
                         ▼        ▼
                 ┌────────────────────────┐
                 │ PostgreSQL             │  (schemas: identity, strategy,
                 │ (managed, encrypted)   │   execution, resource, risk,
                 └────────────────────────┘   intake, reporting, shared)
```

## Component → Service Mapping
| Logical component | Target service (MVP) | Notes |
|---|---|---|
| API (monolith) | Container on managed compute (e.g., ECS/Cloud Run/AKS — chosen at Operations) | Stateless; N replicas; rolling deploy |
| PostgreSQL | Managed Postgres (RDS/Cloud SQL/Azure DB) | At-rest encryption, automated backups, PITR |
| Secrets | Platform secret store (Secrets Manager/Key Vault/GCP SM) | Injected at runtime |
| Web app | Static hosting / CDN (separate repo) | Consumes `@epm/shared` + API |
| Event bus + Outbox relay | In-process (within API) | Broker (SQS/PubSub/Kafka) is the Phase-2 swap path |
| Logs/metrics | Platform log aggregation + metrics | pino JSON → collector; dashboards at Operations |
| CI/CD | GitHub Actions | Build image, run migrations, rolling deploy |

## Environments
| Env | Trigger | Notes |
|---|---|---|
| Development | feature branches + local `docker-compose` (api + Postgres) | Testcontainers for integration tests |
| Staging | merge to `main` | Rolling deploy; migrations auto-run; smoke + health check |
| Production | manual approval / release tag | Rolling deploy; migration gate; health-gated promotion |

## CI/CD Pipeline (GitHub Actions)
```
push/PR → lint (ESLint/Prettier)
        → test: Vitest unit + fast-check PBT + Testcontainers integration
        → build: Turborepo build + Docker image
        → (main) publish @epm/shared (on version change) + deploy staging (rolling, run migrations)
        → (tag/approval) deploy production (rolling, migration gate, health check)
```

## Deployment & Rollback
- **Strategy**: Rolling; new replicas must pass `/health` readiness before old ones drain.
- **Migrations**: run before rollout; forward-only preferred, reversible where feasible; expand-then-contract for breaking schema changes.
- **Rollback**: redeploy previous image; reverse/replace migration; outbox enables event replay after recovery.
- **Health gate**: failed readiness aborts promotion and triggers rollback.

## Security & Networking (baseline)
- TLS everywhere; API not publicly exposing DB; secrets from store; least-privilege DB role (no DDL at runtime except migration job).
- Network: web ↔ API over HTTPS; API ↔ DB in private network; API ↔ IdP over TLS.

> Full IaC (Terraform/CDK) and cloud provider selection are produced in the **Operations** phase; `infrastructure/` in the monorepo is the placeholder.
