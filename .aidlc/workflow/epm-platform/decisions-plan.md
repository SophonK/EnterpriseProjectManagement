# Plan Decisions (DP)

## Context Summary
- **Feature**: EPM/EPPM platform (governance-first MVP) · Greenfield · High complexity
- **Requirements**: 32 stories · 7 functional areas · 4 MVP personas · 1 MVP integration (SSO)
- **Team**: small (4 devs, tech-lead-devs), Tech Lead: Sophon
- **Extensions (blocking)**: security-baseline, resiliency-baseline, property-based-testing (partial)
- **Stack**: deferred to Design (D3)

> Fill in **Answer:** for each question, then say **"done"**. Or say **"use recommendations"** to auto-fill every question with the **(Recommended)** option.

---

## Decision Questions

### DP-1: Decomposition — run it?
**Question**: Should we decompose the platform into units before designing? (7 functional areas / 8 bounded domains, greenfield.)
- 1) **EXECUTE — decompose into units; design/build each independently** **(Recommended)**
- 2) SKIP — treat as one design pass (single monolithic design)
- 3) Other (please specify): _______

**Answer**: 

---

### DP-2: Delivery Mode (if decomposing)
**Question**: How should units be built?
- 1) **Incremental — a shared Foundation first, then per-unit Design→Tasks→Implement; units can progress in parallel across the team** **(Recommended)**
- 2) Comprehensive — design all units together, then build together
- 3) Other (please specify): _______

**Answer**: 

---

### DP-3: Foundation — run it?
**Question**: Greenfield + incremental usually needs a shared Foundation (conventions, contracts, shared data model, auth/RBAC scaffolding, CI). Include it?
- 1) **EXECUTE — establish shared foundation before unit work** **(Recommended)**
- 2) SKIP — let the first unit set conventions ad hoc
- 3) Other (please specify): _______

**Answer**: 

---

### DP-4: Design Depth / Expand Mode
**Question**: How detailed should per-unit design be?
- 1) **Expanded — full sub-stages (components, data model, API, integration, NFR) — fits an enterprise platform with blocking security/resiliency extensions** **(Recommended)**
- 2) Compact — single modular design doc per unit
- 3) Other (please specify): _______

**Answer**: 

---

### DP-5: Overall Depth for Phases
**Question**: What effort level for the executing phases (decomposition, design, tasks)?
- 1) **Standard** — normal rigor across phases **(Recommended)**
- 2) Comprehensive — maximum rigor/traceability everywhere (higher overhead)
- 3) Minimal — lightest touch (not advised for enterprise scope)
- 4) Other (please specify): _______

**Answer**: 

---

### DP-6: Risk Tolerance
**Question**: What risk posture should the workflow take?
- 1) **Balanced — sensible review gates, hardening alongside delivery** **(Recommended)**
- 2) Conservative — extra gates and reviews (slower, safest)
- 3) Aggressive — move fast, defer hardening (not advised — security/resiliency are blocking)
- 4) Other (please specify): _______

**Answer**: 

---

### DP-7: Rollback / Reversibility Expectation
**Question**: How reversible must changes be?
- 1) **Moderate — standard migrations and versioned releases; recoverable with effort** **(Recommended)**
- 2) Easy — every change trivially reversible (feature flags everywhere, extra cost)
- 3) Best-effort — reversibility not a priority
- 4) Other (please specify): _______

**Answer**: 

---

### DP-8: Prototype Before Design?
**Question**: Do requirements feel uncertain enough to warrant a throwaway spike first?
- 1) **No — requirements are clear (governance-first MVP well-defined); go straight to decomposition/design** **(Recommended)**
- 2) Yes — spike a core flow (e.g., capacity allocation or portfolio dashboard) to de-risk first
- 3) Other (please specify): _______

**Answer**: 

---

## Decisions Summary
<!-- Answered via "use recommendations" on 2026-07-07. -->
- DP-1 Decomposition: EXECUTE — decompose into units
- DP-2 Delivery Mode: Incremental — shared Foundation first, then per-unit Design→Tasks→Implement (parallelizable)
- DP-3 Foundation: EXECUTE — establish shared foundation before unit work
- DP-4 Design Expand Mode: Expanded — full sub-stages (components, data model, API, integration, NFR)
- DP-5 Depth: Standard
- DP-6 Risk Tolerance: Balanced
- DP-7 Rollback: Moderate — versioned releases + standard migrations
- DP-8 Prototype-First: No — go straight to decomposition

---

## Validation Notes (DP)
- No conflicts detected. Design executes (not skipped); risk balanced (not aggressive); decomposition executes (not skipped); depth standard (not over-scoped); greenfield so no brownfield module-strategy conflict; expanded design justified by enterprise scope (32 stories) + blocking security/resiliency extensions (Expanded-on-Simple-Greenfield rule not triggered).

---

**Instructions**: Answers applied via "use recommendations".
