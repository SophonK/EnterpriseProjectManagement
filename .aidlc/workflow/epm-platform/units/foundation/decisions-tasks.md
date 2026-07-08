# Tasks Decisions (D4) — Unit: foundation

## Context Summary
- **Unit**: foundation (infrastructure) · owner: Sophon
- **Design**: 13 shared components · scaffold + shared packages · stack NestJS/Prisma/Zod/openid-client/pino
- **Blocking extensions**: security-baseline, resiliency-baseline, property-based-testing (partial)
- **Build order** already sketched in implementation.md (11 steps)

> Fill in **Answer:** for each question, then say **"done"**. Or say **"use recommendations"**.

---

## Decision Questions

### D4-1: Task Breakdown Strategy
- 1) **Component-first — build shared infra components in dependency order (scaffold → shared pkg → db → app → cross-cutting)** **(Recommended)**
- 2) Layer-by-layer
- 3) Vertical slice
- 4) Other: _______

**Answer**: 

---

### D4-2: Implementation Approach
- 1) **Test-first for pure/shared logic (auth eval, error map, event serialize), test-after for wiring** **(Recommended — PBT is blocking)**
- 2) Full TDD everywhere
- 3) Test-after
- 4) Other: _______

**Answer**: 

---

### D4-3: Testing Strategy
- 1) **Unit + integration (Vitest + fast-check PBT + Testcontainers Postgres)** **(Recommended)**
- 2) Unit only
- 3) Full pyramid incl. E2E
- 4) Other: _______

**Answer**: 

---

### D4-4: Task Granularity
- 1) **Standard (1–2 days per task)** **(Recommended)**
- 2) Fine-grained (2–4h)
- 3) Coarse (3–5d)
- 4) Other: _______

**Answer**: 

---

### D4-5: Parallel Work
- 1) **Sequential — single owner (Sophon), strong dependency chain** **(Recommended)**
- 2) Parallel by layer
- 3) Other: _______

**Answer**: 

---

### D4-6: Integration Strategy (OIDC IdP)
- 1) **Contract/mock-first — stub IdP (test issuer + JWKS) for dev/CI; wire real IdP at deploy** **(Recommended)**
- 2) Real IdP from the start
- 3) Other: _______

**Answer**: 

---

### D4-7: Estimates
- 1) **T-shirt sizes (S/M/L)** **(Recommended)**
- 2) Hours
- 3) Story points
- 4) None
- 4) Other: _______

**Answer**: 

---

## Decisions Summary
<!-- Answered via "use recommendations" 2026-07-07. -->
- D4-1 Breakdown: Component-first (dependency order)
- D4-2 Approach: Test-first for pure/shared logic; test-after for wiring
- D4-3 Testing: Unit + integration (Vitest + fast-check + Testcontainers)
- D4-4 Granularity: Standard (1–2 days)
- D4-5 Parallel: Sequential (single owner, dependency chain)
- D4-6 Integration: Contract/mock-first IdP (stub issuer + JWKS); real at deploy
- D4-7 Estimates: T-shirt sizes (S/M/L)

---

## Validation Notes (D4)
- No conflicts. Testing strategy present (unit+integration); CI/CD pipeline tasks included (D3 = GitHub Actions); DB migration + seed tasks included (D3 = Prisma Migrate); PBT tasks included (blocking). Cloud provisioning/IaC deferred to Operations phase (documented assumption) — not a Cloud-Deploy-Without-Infra conflict since infra units are explicitly Operations-phase.

---

**Instructions**: Answers applied via "use recommendations".
