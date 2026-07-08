# Correctness & PBT — project-execution

## Property-Based Tests (fast-check)

These properties must be covered in `apps/api/src/modules/project-execution/**/*.spec.ts` using `fast-check`.

---

### P1: Date Range Validation — Reject Invalid Ranges

**Property**: For any `plannedStart` and `plannedEnd` where `plannedEnd < plannedStart`, `ProjectService.createProject()` must throw `EXECUTION_001`.

```typescript
fc.property(
  fc.date(), fc.date(),
  (start, end) => {
    fc.pre(end < start);
    await expect(service.createProject({ plannedStart: start, plannedEnd: end, ... }))
      .rejects.toMatchObject({ code: 'EXECUTION_001' });
  }
)
```

**Why PBT**: boundary conditions (same day, off-by-one in date arithmetic) are easy to miss with example tests.

---

### P2: Date Range Validation — Accept Valid Ranges

**Property**: For any `plannedStart` and `plannedEnd` where `plannedEnd >= plannedStart`, project creation succeeds (given other valid fields).

```typescript
fc.property(
  fc.date(), fc.nat(),
  (start, daysOffset) => {
    const end = addDays(start, daysOffset);
    await expect(service.createProject({ plannedStart: start, plannedEnd: end, ... }))
      .resolves.toBeDefined();
  }
)
```

---

### P3: Roll-Up Count Consistency

**Property**: For any set of N projects with arbitrary health values, `RollupService.recomputeRollup()` produces a snapshot where `onTrackCount + atRiskCount + offTrackCount === totalCount` and each count equals the exact count of projects with that health (excluding Cancelled).

```typescript
fc.property(
  fc.array(fc.constantFrom('OnTrack', 'AtRisk', 'OffTrack'), { minLength: 0, maxLength: 50 }),
  async (healthValues) => {
    // seed projects, recompute, assert
    const snapshot = await rollupService.recomputeRollup(portfolioId);
    expect(snapshot.onTrackCount + snapshot.atRiskCount + snapshot.offTrackCount).toBe(snapshot.totalCount);
    expect(snapshot.onTrackCount).toBe(healthValues.filter(h => h === 'OnTrack').length);
  }
)
```

---

### P4: Milestone Overdue — Completeness

**Property**: For any milestone where `dueDate < today AND completedAt IS NULL`, `MilestoneRepository.findByProject()` must return `overdue = true`. For any milestone where `completedAt != null`, `overdue` must be `false`.

```typescript
fc.property(
  fc.record({ dueDate: pastDate(), completedAt: fc.constant(null) }),
  async (milestone) => {
    const result = await milestoneRepo.findByProject(projectId);
    expect(result.find(m => m.id === milestone.id)?.overdue).toBe(true);
  }
)
```

---

### P5: Status Transition Completeness

**Property**: For every invalid transition pair `(from, to)` from the state machine, `ProjectService.updateStatusHealth()` returns `EXECUTION_003`. For every valid transition, it succeeds.

This is example-based (finite state machine) but expressed as a table-driven test covering all 12 transition pairs.

---

## Unit Test Coverage Requirements

- `ProjectService`: 100% branch coverage on date validation, status transitions, record-scope enforcement
- `RollupService`: 100% branch coverage on health counting logic
- `MilestoneRepository`: overdue flag set/clear logic
- `ProjectExecutionEventSub`: idempotency check for `DemandPromoted`

## Integration Tests (Testcontainers / real Postgres)

- Full CRUD cycle for projects and milestones
- Roll-up recomputation after status change
- Record-scope filter returns only scoped projects
- Audit entries written on create/update/delete
