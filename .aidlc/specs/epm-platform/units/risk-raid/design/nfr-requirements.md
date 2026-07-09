# risk-raid — NFR Requirements

## Performance
- List RAID items for a project: p95 < 200ms for up to 500 items.
- Escalation check on write: < 50ms added latency.

## Availability
- Inherits platform 99.9% uptime SLA.
- No external synchronous dependencies beyond the shared PostgreSQL.

## Security
- All endpoints require a valid JWT (`AuthContext`).
- Deny-by-default: every handler declares its required permission.
- Record-level scoping: PROJECT_MANAGER sees only items for their own projects; PORTFOLIO_MANAGER scoped to their portfolio's projects; EPMO_DIRECTOR sees all.
- Audit trail: every create/update/delete recorded via `AuditService`.

## Data Integrity
- `riskScore` must always equal `severity × probability` for Risk-type items.
- Circular dependencies between two projects must be rejected.
- Terminal-status RAID items cannot be reopened.

## Observability
- Structured log on escalation event (raidItemId, score, threshold).
- All event publishes logged at INFO level.
