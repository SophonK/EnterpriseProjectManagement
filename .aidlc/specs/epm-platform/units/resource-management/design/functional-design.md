# Functional Design — resource-management

## Aggregates

### Resource (root)
- Owns: Skill[], CapacityPeriod[], Allocation[] (via FK)
- Invariants:
  - email must be unique across all resources
  - skill `(resourceId, name)` pair must be unique
  - `fteCapacity` > 0
  - each `CapacityPeriod.periodStart` is the first day of a calendar month

### Allocation
- Belongs to Resource; references a Project (soft FK)
- Invariants:
  - `periodEnd >= periodStart`
  - `allocationPct` > 0
  - `periodStart` / `periodEnd` are first-of-month dates (service normalises to first-of-month)

## Business Rules

### BR-1: Over-allocation detection
For a given resource and any calendar month M that the new/updated allocation overlaps:
```
totalAllocated(resource, M) = SUM(allocationPct) for all allocations
    where resourceId = R
      AND periodStart <= firstDayOf(M)
      AND periodEnd   >= firstDayOf(M)
```
If `totalAllocated > 100` for any M in the range → over-allocation.

**Action**:
1. Return `OverAllocationWarning` listing each affected month and its total %.
2. If `confirmOverAllocation = false` → reject with `RESOURCE_004`.
3. If `confirmOverAllocation = true` → save with `overAllocatedConfirmed = true`; publish `ResourceOverAllocated` event; set `resource.overAllocated = true`.

### BR-2: Capacity effective value per month
For utilization computation, a resource's capacity for month M is:
- `CapacityPeriod.capacityPct` if a `CapacityPeriod` row exists for `(resourceId, firstDayOf(M))`
- Otherwise `Resource.fteCapacity`

### BR-3: Utilization band
```
utilization(resource, M) = totalAllocated(resource, M) / capacity(resource, M) * 100
```
Band:
- `Under` — utilization < 80%
- `Optimal` — 80% ≤ utilization ≤ 100%
- `Over` — utilization > 100%

### BR-4: Capacity-vs-demand
For each pool P, month M:
```
totalCapacity(P, M) = SUM(capacity(r, M)) for all resources r in pool P
totalDemand(P, M)   = SUM(totalAllocated(r, M)) for all resources r in pool P
gap(P, M)           = totalCapacity(P, M) - totalDemand(P, M)
shortfall           = gap < 0
```

### BR-5: Period normalisation
Service normalises any input date to the first day of its calendar month before persisting. E.g. `2026-08-15` → `2026-08-01`.

### BR-6: `resource.overAllocated` flag maintenance
- Set to `true` whenever any allocation write results in over-allocation for any current or future month.
- Recomputed (may clear to `false`) after any allocation delete or update that reduces total.
- Recomputation: check current + future months only (past months are immutable history).

## Resource Pool management
- Pools are created by EPMO_DIRECTOR only.
- A resource belongs to exactly one pool.
- Deleting a pool is blocked if it has resources (service throws `RESOURCE_003`-style conflict).

## Soft-delete of Resource
If the resource has future allocations (periodEnd ≥ today), service sets `deletedAt` column (soft delete) and excludes from queries. If no future allocations, hard delete (cascades skills, capacity periods, past allocations).

> **Note**: `deletedAt` column added to `resource.resource` table; filtered in all repo queries.
