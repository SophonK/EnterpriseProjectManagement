# Foundation Decisions (DF)

## Context Summary
- **Feature**: EPM/EPPM platform · Greenfield · Modular Monolith · Domain-Driven · 7 units
- **Team**: Small team (2) — Tech Lead: Sophon · Dev: Chavakorn · repo: https://github.com/SophonK/EnterpriseProjectManagement.git
- **Unit owners (assigned)**: identity-access→Sophon, strategy-portfolio→Sophon, demand-intake→Sophon, project-execution→Chavakorn, resource-management→Chavakorn, risk-raid→Chavakorn, reporting-dashboards→Chavakorn
- **Extensions (blocking)**: security-baseline, resiliency-baseline, property-based-testing (partial)
- **Note**: Stack was deferred at Context/Design — **this gate is where the shared stack is chosen.**

> Fill in **Answer:** for each question, then say **"done"**. Or say **"use recommendations"**.

---

## Decision Questions

### DF-1: Primary Language & Runtime
**Question**: What language/runtime for the platform?
- 1) **TypeScript (Node.js) — one language across API + web, strong ecosystem, fast for a small team** **(Recommended)**
- 2) Java (Spring Boot) — enterprise-standard, strong typing, heavier
- 3) C# (.NET) — enterprise-standard on Microsoft stack
- 4) Python (FastAPI) / Go / Other (please specify): _______

**Answer**: 1

---

### DF-2: Frontend Framework
**Question**: What frontend for the dashboards & data-entry UI?
- 1) **React (with TypeScript) — largest ecosystem, component libraries for dashboards** **(Recommended)**
- 2) Angular — batteries-included, enterprise-friendly
- 3) Vue / Svelte / Other (please specify): _______

**Answer**: 1

---

### DF-3: Package Manager & Monorepo Tooling
**Question**: How is the monorepo managed?
- 1) **pnpm workspaces + Turborepo — fast, efficient caching** **(Recommended)**
- 2) npm/yarn workspaces + Nx
- 3) Other (please specify): _______

**Answer**: 1

---

### DF-4: Repository Strategy
**Question**: Repo layout?
- 1) **Monorepo — API, web, and shared packages in one repo (matches the single GitHub repo)** **(Recommended)**
- 2) Multi-repo (per unit/service)
- 3) Hybrid
- 4) Other (please specify): _______

**Answer**: 2

---

### DF-5: Shared Foundations Level
**Question**: How much should the Foundation define up front?
- 1) **Comprehensive — all shared sections (conventions, error handling, auth, comms, DB, contracts, infra, observability, CI/CD) — fits enterprise + blocking security/resiliency** **(Recommended)**
- 2) Standard — conventions + error + auth + comms + DB
- 3) Minimal — conventions + error only
- 4) Other (please specify): _______

**Answer**: 2

---

### DF-6: Authentication
**Question**: Auth mechanism? (SSO via SAML/OIDC is a requirement.)
- 1) **OAuth2 / OIDC with the enterprise IdP; short-lived JWT access tokens + refresh; RBAC claims** **(Recommended)**
- 2) Session-based (server session store)
- 3) API keys / Other (please specify): _______

**Answer**: 1

---

### DF-7: Error Handling Format
**Question**: Standard API error format?
- 1) **RFC 7807 (application/problem+json) with a shared error-code registry** **(Recommended)**
- 2) Custom envelope { data, error, meta }
- 3) Framework default / Other (please specify): _______

**Answer**: 1

---

### DF-8: Inter-Unit Communication
**Question**: How do units interact within the Modular Monolith?
- 1) **In-process module APIs (typed service interfaces) + async domain events for roll-ups/escalation** **(Recommended)**
- 2) Everything synchronous in-process
- 3) REST between units / Message broker throughout
- 4) Other (please specify): _______

**Answer**: 1

---

### DF-9: Database Strategy
**Question**: Data storage approach?
- 1) **Single PostgreSQL database, separate schema per unit (bounded-context isolation, cross-schema reads for reporting)** **(Recommended)**
- 2) Database per unit
- 3) Single shared schema
- 4) Other (please specify): _______

**Answer**: 1

---

### DF-10: Shared Types Strategy
**Question**: How are shared contracts/types kept consistent?
- 1) **Shared TypeScript package (`@epm/shared`) for domain types, DTOs, error codes, event schemas** **(Recommended)**
- 2) Code generation (OpenAPI → types)
- 3) Manual sync
- 4) Other (please specify): _______

**Answer**: 1

---

### DF-11: Infrastructure Units
**Question**: What dedicated infrastructure units are needed?
- 1) **None dedicated — a single combined Foundation unit (auth middleware, event bus in-process, DB setup, shared packages, CI)** **(Recommended for modular monolith + small team)**
- 2) Separate Auth service + Event bus units
- 3) API Gateway unit
- 4) Other (please specify): _______

**Answer**: 1

---

### DF-12: Infrastructure Unit Strategy
**Question**: Combined or separate infra units?
- 1) **Combined — one Foundation unit holds all shared infrastructure** **(Recommended)**
- 2) Separate individual infra units
- 3) Other (please specify): _______

**Answer**: 1

---

### DF-13: CI/CD Pipeline
**Question**: CI/CD tooling?
- 1) **GitHub Actions (repo is on GitHub) — lint → test → build → deploy** **(Recommended)**
- 2) GitLab CI / CircleCI / Jenkins / Other (please specify): _______

**Answer**: 1

---

### DF-14: Branch Strategy
**Question**: Git branch model for 2 devs with per-unit ownership?
- 1) **GitHub Flow — short-lived feature branches per unit, PR review, merge to main** **(Recommended)**
- 2) Trunk-based (direct to main + flags)
- 3) GitFlow (heavier) / Other (please specify): _______

**Answer**: 1

---

### DF-15: Deployment Strategy
**Question**: How are releases rolled out?
- 1) **Rolling deployment (versioned releases + DB migrations)** **(Recommended)**
- 2) Blue-Green
- 3) Canary / Direct / Other (please specify): _______

**Answer**: 1

---

## Decisions Summary
<!-- Recorded from user answers 2026-07-07. ⚠️ 2 conflicts pending resolution (DF-4). -->
- DF-1 Language/Runtime: TypeScript (Node.js)
- DF-2 Frontend: React (TypeScript)
- DF-3 Package/Monorepo: pnpm workspaces + Turborepo
- DF-4 Repo Strategy: Hybrid (RESOLVED) — backend Modular Monolith monorepo (units + Foundation + shared source) + separate web frontend repo; @epm/shared published as a versioned package for cross-repo use
- DF-5 Foundations Level: Standard (conventions + error + auth + comms + DB)
- DF-6 Auth: OAuth2/OIDC + short-lived JWT + refresh, RBAC claims
- DF-7 Error Format: RFC 7807 (application/problem+json) + shared error-code registry
- DF-8 Inter-Unit Comms: In-process module APIs + async domain events
- DF-9 Database: Single PostgreSQL, schema per unit
- DF-10 Shared Types: Shared TypeScript package (@epm/shared)
- DF-11 Infra Units: None dedicated (combined Foundation)
- DF-12 Infra Strategy: Combined (single Foundation unit)
- DF-13 CI/CD: GitHub Actions
- DF-14 Branch Strategy: GitHub Flow
- DF-15 Deployment: Rolling

---

## Validation Notes (DF) — ⚠️ CONFLICTS DETECTED (awaiting resolution)

**🔴 Conflict 1 — Multi-repo vs. Modular Monolith stack**
DF-4 (Multi-repo per unit) contradicts every other structural decision:
- D2 architecture = **Modular Monolith** (one deployable)
- DF-3 = **pnpm workspaces + Turborepo** (monorepo tooling)
- DF-8 = **in-process module APIs** (units call each other in-process, not over the network)
- DF-9 = **single shared PostgreSQL** (one DB, schemas per unit)
- DF-11/12 = **combined Foundation unit** (shared in-process infra)
Multi-repo-per-service is a microservices repo layout; it cannot host in-process calls into a single shared DB.

**🟡 Conflict 2 — Multi-repo + shared types package**
DF-4 (multi-repo) + DF-10 (`@epm/shared` package) forces cross-repo publishing/versioning of shared types → drift risk and release friction.

**RESOLVED (2026-07-07) — Option 3: Hybrid.**
- **Backend monorepo** (SophonK/EnterpriseProjectManagement): Modular Monolith API — all 7 domain units as internal modules + the Foundation unit + `packages/shared` (`@epm/shared`) source. pnpm workspaces + Turborepo. In-process module APIs + domain events; single PostgreSQL, schema per unit. → resolves Conflict 1 (monolith intact).
- **Web frontend repo** (separate): React (TypeScript) app; consumes `@epm/shared` as a published versioned package.
- **@epm/shared**: workspace package in the backend monorepo, **published to a private registry (GitHub Packages)** so the separate web repo consumes a versioned artifact. → Conflict 2 reduced to a single, deliberately-managed cross-repo boundary (web ↔ shared) with SemVer discipline, instead of per-unit publishing.
- Everything else stands as answered (Standard foundation depth).
