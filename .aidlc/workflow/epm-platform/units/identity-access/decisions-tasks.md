# Tasks Decisions (D4) — Unit: identity-access

## Context Summary
- **Unit**: identity-access (domain) · owner: Sophon · schema `identity`
- **Design**: user/role/permission/scope data + admin endpoints on foundation; DB-driven authz via enricher (foundation hook already merged)
- **Blocking extensions**: security-baseline, resiliency-baseline, property-based-testing (partial)

> Fill in **Answer:** for each question, then say **"done"**. Or say **"use recommendations"**.

---

## Decision Questions

### D4-1: Task Breakdown Strategy
- 1) **Component-first, dependency order (schema/migration → repos → directory/enricher → services → controller → wiring)** **(Recommended)**
- 2) Layer-by-layer · 3) Vertical slice · 4) Other: _______

**Answer**: 

---

### D4-2: Implementation Approach
- 1) **Test-first for pure/shared logic (permission union, scope loading); test-after for wiring** **(Recommended — PBT blocking)**
- 2) Full TDD · 3) Test-after · 4) Other: _______

**Answer**: 

---

### D4-3: Testing Strategy
- 1) **Unit + integration (Vitest + fast-check + Testcontainers for migrate/seed)** **(Recommended)**
- 2) Unit only · 3) Full pyramid · 4) Other: _______

**Answer**: 

---

### D4-4: Task Granularity
- 1) **Standard (1–2 days)** **(Recommended)** · 2) Fine (2–4h) · 3) Coarse · 4) Other: _______

**Answer**: 

---

### D4-5: Parallel Work
- 1) **Sequential (single owner Sophon, dependency chain)** **(Recommended)** · 2) Parallel by layer · 3) Other: _______

**Answer**: 

---

### D4-6: Foundation-binding step
**Question**: How to bind identity's `UserDirectoryService` as the foundation `AuthContextEnricher`?
- 1) **A dedicated task: provide `AUTH_CONTEXT_ENRICHER` in IdentityAccessModule (foundation hook already merged)** **(Recommended)**
- 2) Fold into module-wiring task · 3) Other: _______

**Answer**: 

---

### D4-7: Estimates
- 1) **T-shirt (S/M/L)** **(Recommended)** · 2) Hours · 3) Story points · 4) None

**Answer**: 

---

## Decisions Summary
<!-- Answered via "use recommendations" 2026-07-07. -->
- D4-1 Breakdown: Component-first, dependency order
- D4-2 Approach: Test-first for pure/shared logic; test-after for wiring
- D4-3 Testing: Unit + integration (Vitest + fast-check + Testcontainers)
- D4-4 Granularity: Standard (1–2 days)
- D4-5 Parallel: Sequential (single owner)
- D4-6 Enricher binding: Dedicated task — provide AUTH_CONTEXT_ENRICHER in IdentityAccessModule
- D4-7 Estimates: T-shirt (S/M/L)

## Validation Notes (D4)
- No conflicts. Testing present; migration + seed tasks included; PBT tasks (P-IA-1/2/3) included; foundation hook already merged (enricher binding is now just a provider wiring task, no foundation change needed).

**Instructions**: Answers applied via "use recommendations".
