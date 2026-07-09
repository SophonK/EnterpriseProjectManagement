# risk-raid — D4 Design

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Risk scoring | `severity × probability` (each 1–5 → score 1–25) | Linear product is industry-standard; integer bounds give tractable PBT |
| Escalation trigger | Synchronous on write; `score ≥ threshold` flags item | Immediate visibility; avoids async delay for governance-critical events |
| Escalation threshold | System default 15 (configurable per-deployment via env `RAID_ESCALATION_THRESHOLD`) | Score 15 = severity 3 × probability 5 (or 5×3); captures "high" end of standard risk matrix |
| Escalated state | Boolean flag on `RaidItem` (not a status value) | Escalation is orthogonal to workflow status (an escalated item can still be Open or InProgress) |
| Status transitions | Open → InProgress (on owner assign) → Resolved / Closed / Accepted | Minimal state machine covering US-026 accountability lifecycle |
| Dependency model | Separate `Dependency` entity (not a RaidItem type) | Dependencies link two projects, not owned by one; different write/read paths |
| Circular dependency | Direct A→B + B→A check on create (no full graph traversal in MVP) | MVP scope; full cycle detection deferred to Phase 2 |
| projectId reference | Soft FK (string); validated via `ProjectService.getProject()` at write time | Consistent with resource-management pattern; avoids cross-schema FK |
| Record scoping | PROJECT_MANAGER scoped to their project list; PORTFOLIO_MANAGER to their portfolio; EPMO_DIRECTOR sees all | RBAC + recordScopes pattern identical to resource-management |
| PBT coverage | P1 score formula, P2 escalation completeness, P3 score bounds exhaustive, P4 circular-dep detection | Property-based-testing (partial) extension |

## Unit Overview

- **DB schema**: `risk` (5 tables: `raid_item`, `dependency`, `raid_item_comment`, plus `raid_item_tag` and `escalation_config` deferred to Phase 2 — MVP uses 2 tables)
- **Module**: `RiskRaidModule` — 2 controllers, 2 services, 2 repositories, 1 event subscriber
- **Events published**: `risk-raid.raid.logged`, `risk-raid.risk.escalated`, `risk-raid.dependency.linked`
- **Events subscribed**: `project-execution.project.created` (no-op), `project-execution.project.archived` (auto-close open items)
