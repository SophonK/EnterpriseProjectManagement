# Correctness & PBT — resource-management

## Property-Based Tests (fast-check)

### P1: Allocation sum is commutative and correct
**Invariant**: The total allocation % for a resource in any month M is the sum of all `allocationPct` values of allocations that overlap M. Order of creation does not affect the result.
```
∀ allocations A1..An overlapping month M:
  totalAllocated(resource, M) = SUM(allocationPct for each A overlapping M)
```
**Generator**: arbitrary list of non-overlapping and overlapping allocations with arbitrary pct values; check total matches naive summation.

### P2: Over-allocation detection is complete
**Invariant**: If and only if `totalAllocated(resource, M) > 100` for any M in the proposed allocation's range, the service returns an over-allocation warning for that month.
```
∀ existing allocations, ∀ new allocation:
  overAllocWarning.periods contains M ↔ totalAllocated(resource, M) > 100
```
**Generator**: arbitrary existing allocations + a new allocation; check warning completeness vs naive computation.

### P3: Utilization band boundaries are exhaustive and non-overlapping
**Invariant**: Every utilization value maps to exactly one band.
```
∀ u ∈ [0, ∞):
  exactly one of { u < 80, 80 ≤ u ≤ 100, u > 100 } is true
  → exactly one of { Under, Optimal, Over }
```
**Generator**: arbitrary non-negative decimal; assert exactly one band matches.

### P4: Period normalisation is idempotent
**Invariant**: Normalising an already-normalised date is a no-op.
```
∀ date d: normalise(normalise(d)) = normalise(d)
```

## Unit-test assertions (deterministic)

| Test | Expectation |
|---|---|
| Create resource with valid data | Returns `ResourceDTO` with correct fields |
| Create resource duplicate email | Throws `RESOURCE_003` |
| Allocate within capacity | Returns `AllocationDTO`, no warning |
| Allocate over 100%, no confirm | Throws `RESOURCE_004` |
| Allocate over 100%, confirmed | Saves with `overAllocatedConfirmed=true`, publishes `ResourceOverAllocated` |
| Delete allocation → clears overAllocated flag | `resource.overAllocated` becomes false when no more over-alloc months |
| Utilization view — under-utilised resource | Band = `Under` |
| Utilization view — exactly 100% allocated | Band = `Optimal` |
| Capacity-demand — demand > capacity | `shortfall=true` |
| `getProject` returns null for unknown projectId | Throws `RESOURCE_002` |
