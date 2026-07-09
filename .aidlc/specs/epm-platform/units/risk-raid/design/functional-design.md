# risk-raid — Functional Design

## Business Rules

### BR-1: RAID Item Types
Four types are supported: `Risk`, `Assumption`, `Issue`, `Dependency` (the latter is kept on `RaidItem` as the legacy RAID "D" entry; cross-project structural links use the separate `Dependency` entity).

### BR-2: Risk Score Computation
- Only applies to type `Risk`.
- `riskScore = severity × probability` where severity ∈ [1, 5] and probability ∈ [1, 5].
- Score range: 1–25.
- For non-Risk types, `severity`, `probability`, and `riskScore` are `null`.
- Validation: if `type = Risk`, `severity` and `probability` are **required**.

### BR-3: Escalation
- After every create or update of a Risk-type item, compute `riskScore`.
- If `riskScore >= ESCALATION_THRESHOLD` (default 15, env `RAID_ESCALATION_THRESHOLD`) **and** item is not yet escalated → set `escalated = true`, publish `risk-raid.risk.escalated`.
- If score drops below threshold on update (e.g., severity reduced) → set `escalated = false` (de-escalate silently, no event).
- Non-Risk types are never escalated.

### BR-4: Status Transitions
```
Open ──── (assign owner) ──→ InProgress ──→ Resolved
                                          ├──→ Closed
                                          └──→ Accepted
Rejected  (terminal; for Assumptions that prove false)
```
- `Open` → `InProgress`: triggered when `ownerId` is set on an otherwise `Open` item.
- `InProgress` → `Resolved` / `Closed` / `Accepted`: explicit status update command; records `closedBy` + `closedAt`.
- Terminal statuses cannot be re-opened.
- `escalated` flag is independent of status.

### BR-5: Owner & Mitigation (US-026)
- `PATCH /api/v1/raid/:id` with `{ ownerId, mitigation }` transitions status to `InProgress` if currently `Open`.
- `closedBy` + `closedAt` are set when status moves to a terminal value.

### BR-6: Circular Dependency Prevention (US-027)
- On `POST /api/v1/dependencies`, before saving, check: does a row exist with `fromProjectId = req.toProjectId AND toProjectId = req.fromProjectId`?
- If yes → reject with `RISK_003` (Circular dependency).
- Self-loop (`fromProjectId === toProjectId`) is also rejected with `RISK_001`.

### BR-7: Project Reference Validation
- On any RAID item create, call `ProjectService.getProject(projectId, ctx)`.
- If not found or out of scope → throw `RISK_002`.
- Same check for both `fromProjectId` and `toProjectId` on Dependency create.

### BR-8: Soft Delete / Archive on Project Archived
- When `project-execution.project.archived` is received, update all `Open` and `InProgress` RaidItems for that project → set `status = Closed`, `closedAt = now()`, `closedBy = "system"` (idempotent).
- Already-terminal items are unchanged.

## Escalation Algorithm

```
function evaluateEscalation(item: RaidItem, threshold: number): boolean {
  if (item.type !== 'Risk') return false;
  return item.riskScore >= threshold;
}

// On save:
const shouldEscalate = evaluateEscalation(saved, threshold);
if (shouldEscalate && !saved.escalated) {
  await raidRepo.update(saved.id, { escalated: true });
  await eventBus.publish({ eventType: RISK_RAID_EVENTS.RISK_ESCALATED, data: { ... } });
} else if (!shouldEscalate && saved.escalated) {
  await raidRepo.update(saved.id, { escalated: false });
  // no event for de-escalation
}
```

## Status Machine

| From | To | Condition |
|------|----|-----------|
| Open | InProgress | ownerId set |
| InProgress | Resolved | explicit PATCH status=Resolved |
| InProgress | Closed | explicit PATCH status=Closed |
| InProgress | Accepted | explicit PATCH status=Accepted |
| Any non-terminal | Rejected | explicit PATCH status=Rejected (Assumptions) |
| Open | Closed | project archived (system) |
| InProgress | Closed | project archived (system) |
| Resolved/Closed/Accepted/Rejected | * | blocked — terminal |
