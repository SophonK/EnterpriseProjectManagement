# Integration — resource-management

## Inbound: Events subscribed
| Event | Source | Handler | Idempotent |
|---|---|---|---|
| `project-execution.project.created` | project-execution | Cache projectId as known reference (no-op if already known) | Yes — keyed by `eventId` |
| `project-execution.project.archived` | project-execution | Mark allocations for that projectId as `archivedProjectId` so they are excluded from active utilization | Yes |

## Outbound: Events published
| Event | When | Payload |
|---|---|---|
| `resource-management.resource.allocated` | Allocation created/updated | `{ allocationId, resourceId, projectId, periodStart, periodEnd, allocationPct }` |
| `resource-management.resource.over-allocated` | Allocation pushes total >100% (even if confirmed) | `{ resourceId, poolId, periods: [{ month, totalPct }] }` |

## In-process: Module APIs consumed
| Module | Method | Why |
|---|---|---|
| `ProjectExecutionModule` → `ProjectService` | `getProject(id, ctx)` | Validate `projectId` soft-FK on allocation write; throws `RESOURCE_002` if not found or out of scope |

## In-process: Module APIs exposed (for consumers)
| Method | Consumer | Contract |
|---|---|---|
| `AllocationService.getAllocationsForProject(projectId, ctx)` | reporting-dashboards | Returns all allocations referencing a project |
| `UtilizationService.getUtilization(filter, ctx)` | reporting-dashboards | Returns utilization rows for the heatmap |
| `CapacityService.getCapacityDemand(filter, ctx)` | reporting-dashboards | Returns capacity-vs-demand summary |

## Cross-unit data boundary rules
- resource-management **never writes** to the `execution` schema.
- resource-management reads project existence via `ProjectService` in-process API — not direct DB query.
- `projectId` on `allocation` is a string soft-FK; referential integrity enforced at service layer, not DB level.
