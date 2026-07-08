# Design Decisions (D3) — Unit: foundation

## Context Summary
- **Unit**: foundation (infrastructure) · owner: Sophon · Modular Monolith scaffold
- **Inherited from foundation.md (SETTLED — not re-asked)**: TypeScript / Node.js 20 · PostgreSQL (schema per unit) · OAuth2/OIDC + JWT · RFC 7807 errors · in-process module APIs + domain events · `@epm/shared` types · pnpm + Turborepo · GitHub Actions · GitHub Flow · rolling deploys
- **Extensions (blocking)**: security-baseline, resiliency-baseline, property-based-testing (partial)
- **Scope**: This gate covers only the **open library/framework choices** for the shared scaffold.

> Fill in **Answer:** for each question, then say **"done"**. Or say **"use recommendations"**.

---

## Decision Questions

### D3-1: HTTP / Application Framework
**Question**: What Node framework hosts the Modular Monolith?
- 1) **NestJS — first-class modules + dependency injection, maps cleanly to the 7 units and in-process module APIs** **(Recommended)**
- 2) Fastify — minimal, fast, manual module wiring
- 3) Express — ubiquitous, least structure
- 4) Other (please specify): _______

**Answer**: 1

---

### D3-2: ORM / Data Access
**Question**: How does each unit access its PostgreSQL schema?
- 1) **Prisma — typed client, first-class migrations, multi-schema support** **(Recommended)**
- 2) Drizzle — lightweight SQL-first, typed
- 3) TypeORM / Knex / raw pg
- 4) Other (please specify): _______

**Answer**: 1

---

### D3-3: Migration Tool
**Question**: How are schema-per-unit migrations managed (in `packages/db`)?
- 1) **Prisma Migrate (versioned, per-schema)** **(Recommended if Prisma)**
- 2) node-pg-migrate
- 3) Other (please specify): _______

**Answer**: 1

---

### D3-4: Validation / Schema Library
**Question**: Input validation and shared schema definitions?
- 1) **Zod — schemas live in `@epm/shared`, reused by API + web + PBT** **(Recommended)**
- 2) class-validator + class-transformer (NestJS-idiomatic)
- 3) Other (please specify): _______

**Answer**: 1

---

### D3-5: OIDC Client Library
**Question**: Library for the OAuth2/OIDC flow + token validation?
- 1) **openid-client (certified OIDC RP) + jose for JWT verification** **(Recommended)**
- 2) Passport.js (passport-openidconnect)
- 3) Other (please specify): _______

**Answer**: 1

---

### D3-6: Domain Event Bus (in-process)
**Question**: How are async domain events dispatched within the monolith?
- 1) **Lightweight typed in-process event bus (interface-abstracted, swappable for a broker later)** **(Recommended)**
- 2) NestJS CQRS EventBus
- 3) Node EventEmitter (raw)
- 4) Other (please specify): _______

**Answer**: 1

---

### D3-7: Logging / Observability Library
**Question**: Structured logging implementation?
- 1) **pino — fast structured JSON, request-id correlation** **(Recommended)**
- 2) winston
- 3) Other (please specify): _______

**Answer**: 1

---

### D3-8: Configuration & Secrets
**Question**: Config/secret loading approach for the scaffold?
- 1) **Typed config module (env-validated via Zod) + platform secret store in staging/prod, `.env` locally** **(Recommended)**
- 2) @nestjs/config with dotenv only
- 3) Other (please specify): _______

**Answer**: 1

---

### D3-9: Testing Stack
**Question**: Test tooling the scaffold sets up for all units?
- 1) **Vitest (unit/integration) + Supertest (HTTP) + fast-check (PBT) + Testcontainers for Postgres** **(Recommended)**
- 2) Jest + Supertest + fast-check
- 3) Other (please specify): _______

**Answer**: 1

---

### D3-10: Correctness & Property-Based Testing (MANDATORY)
**Question**: What correctness properties should the Foundation itself carry (PBT is partial/blocking)?
- 1) **Yes — PBT for shared pure functions & serialization: `DomainEvent<T>` serialize↔deserialize round-trip, RFC 7807 error mapping, and RBAC record-scope evaluation** **(Recommended)**
- 2) Yes — serialization round-trips only
- 3) No PBT in foundation (defer to domain units)
- 4) Other (please specify): _______

**Answer**: 1

---

### D3-11: Containerization
**Question**: Local + deploy runtime packaging?
- 1) **Docker multi-stage image for the API + docker-compose (api + Postgres) for local dev** **(Recommended)**
- 2) Buildpacks
- 3) No containers (run node directly)
- 4) Other (please specify): _______

**Answer**: 1

---

## Decisions Summary
<!-- Answered 2026-07-07 (all recommended). -->
- D3-1 Framework: NestJS (modules + DI)
- D3-2 ORM: Prisma (multi-schema)
- D3-3 Migrations: Prisma Migrate (per-schema)
- D3-4 Validation: Zod (schemas in @epm/shared)
- D3-5 OIDC Library: openid-client + jose
- D3-6 Event Bus: Lightweight typed in-process bus (broker-swappable)
- D3-7 Logging: pino (structured JSON, request-id)
- D3-8 Config/Secrets: Typed config (Zod-validated env) + platform secret store
- D3-9 Testing: Vitest + Supertest + fast-check + Testcontainers
- D3-10 PBT/Correctness: Yes — event serialize↔deserialize round-trip, RFC 7807 mapping, RBAC record-scope evaluation
- D3-11 Containerization: Docker multi-stage + docker-compose (api + Postgres)

---

## Validation Notes (D3)
- No conflicts. All choices consistent with foundation.md (TS/Node, PostgreSQL schema-per-unit, OAuth2/OIDC, RFC 7807, in-process comms, @epm/shared, pnpm+Turborepo).
- Extension enforcement at design gate: security-baseline → nfr.md security controls; resiliency-baseline → nfr-design resilience patterns; property-based-testing (partial) → design/correctness.md (D3-10 properties).

---

**Instructions**: Answers applied (all recommended).
