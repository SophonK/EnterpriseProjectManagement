# Project Structure

## Summary
<!-- 3-line max -->
- **Repo**: Hybrid — backend Modular Monolith monorepo (SophonK/EnterpriseProjectManagement) + separate React web repo
- **Source**: `apps/api` (monolith host), `packages/*` (shared, db, config); web in its own repo
- **Entry**: `apps/api/src/main.ts` (composition root)

## Repository

- **Type**: Hybrid. Backend monorepo (pnpm workspaces + Turborepo) holds the Modular Monolith + shared packages. Web frontend is a separate repo consuming `@epm/shared` as a published package.
- **Root**: https://github.com/SophonK/EnterpriseProjectManagement.git

## Repository Structure

### Backend monorepo
```
EnterpriseProjectManagement/
├── apps/
│   └── api/                         # Modular Monolith host (single deployable)
│       ├── src/
│       │   ├── modules/             # one folder per domain unit
│       │   │   ├── identity-access/
│       │   │   ├── strategy-portfolio/
│       │   │   ├── project-execution/
│       │   │   ├── resource-management/
│       │   │   ├── risk-raid/
│       │   │   ├── demand-intake/
│       │   │   └── reporting-dashboards/
│       │   ├── foundation/          # event bus, auth middleware, error handler, db, bootstrap
│       │   └── main.ts              # composition root — wires modules
│       └── package.json
├── packages/
│   ├── shared/                      # @epm/shared — types, DTOs, error codes, event schemas (published)
│   ├── config/                      # eslint, prettier, tsconfig base
│   └── db/                          # migrations (schema per unit), seed
├── infrastructure/                  # IaC (deferred to Operations)
├── .github/workflows/               # GitHub Actions
├── docker-compose.yml               # local Postgres + api
├── turbo.json
└── pnpm-workspace.yaml
```

### Web frontend repo (separate)
```
epm-web/  (React + TypeScript) — depends on @epm/shared (pinned version)
```

## Key Directories

| Directory | Purpose | Key Contents |
|-----------|---------|-------------|
| apps/api/src/modules/ | Domain units (bounded contexts) | one folder per unit: commands, services, repositories, events |
| apps/api/src/foundation/ | Shared in-process infra | auth, error handler, event bus, db, bootstrap |
| packages/shared/ | Shared contracts | `@epm/shared` types, DTOs, error codes, events |
| packages/db/ | Data layer | migrations (schema per unit), seed |
| packages/config/ | Tooling | ESLint, Prettier, base tsconfig |

## Key Files

| File | Purpose | Notes |
|------|---------|-------|
| apps/api/src/main.ts | Composition root | Wires modules, starts server |
| pnpm-workspace.yaml | Workspace definition | Backend monorepo packages |
| turbo.json | Build orchestration | Turborepo pipeline/caching |
| docker-compose.yml | Local dev | PostgreSQL + api |

## Entry Points

| Entry Point | Type | Description |
|-------------|------|-------------|
| apps/api/src/main.ts | API server | Modular Monolith host — listens on PORT, wires all 7 modules |
| epm-web (separate repo) | Web app | React SPA consuming the API |
