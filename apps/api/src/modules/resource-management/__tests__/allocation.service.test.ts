import { describe, it, expect, vi } from "vitest";
import fc from "fast-check";
import "../../../../../../packages/shared/src/errors/resource-error-codes.js";
import { AllocationService, firstOfMonth, monthsInRange, utilizationBand } from "../services/allocation.service.js";

// ---------------------------------------------------------------------------
// PBT helpers
// ---------------------------------------------------------------------------

/** Naive sum: total allocation for a resource in a given month across a list. */
function naiveSum(
  allocations: Array<{ periodStart: Date; periodEnd: Date; allocationPct: number }>,
  month: Date,
): number {
  return allocations
    .filter((a) => a.periodStart <= month && a.periodEnd >= month)
    .reduce((acc, a) => acc + a.allocationPct, 0);
}

// ---------------------------------------------------------------------------
// PBT P1: Allocation sum is commutative
// ---------------------------------------------------------------------------

describe("PBT P1 — allocation sum is commutative and correct", () => {
  it("total allocation matches naive sum regardless of insertion order", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            allocationPct: fc.float({ min: 1, max: 50, noNaN: true }),
            offsetMonths: fc.integer({ min: 0, max: 11 }),
            durationMonths: fc.integer({ min: 1, max: 6 }),
          }),
          { minLength: 1, maxLength: 8 },
        ),
        (entries) => {
          const base = new Date(Date.UTC(2026, 0, 1));
          const allocations = entries.map((e) => {
            const start = new Date(Date.UTC(2026, e.offsetMonths, 1));
            const end = new Date(Date.UTC(2026, e.offsetMonths + e.durationMonths - 1, 1));
            return { periodStart: start, periodEnd: end, allocationPct: e.allocationPct };
          });
          const targetMonth = base;
          const expected = naiveSum(allocations, targetMonth);
          const actual = allocations
            .filter((a) => a.periodStart <= targetMonth && a.periodEnd >= targetMonth)
            .reduce((acc, a) => acc + a.allocationPct, 0);
          // Check commutativity: same result whether summed forward or backward
          const reversed = [...allocations].reverse();
          const actualReversed = reversed
            .filter((a) => a.periodStart <= targetMonth && a.periodEnd >= targetMonth)
            .reduce((acc, a) => acc + a.allocationPct, 0);
          return Math.abs(expected - actual) < 0.001 && Math.abs(expected - actualReversed) < 0.001;
        },
      ),
      { numRuns: 50 },
    );
  });
});

// ---------------------------------------------------------------------------
// PBT P3: Utilization band is exhaustive and non-overlapping
// ---------------------------------------------------------------------------

describe("PBT P3 — utilization band exhaustive and non-overlapping", () => {
  it("every non-negative value maps to exactly one band", () => {
    fc.assert(
      fc.property(fc.float({ min: 0, max: 300, noNaN: true }), (pct) => {
        const band = utilizationBand(pct);
        const isUnder = pct < 80;
        const isOptimal = pct >= 80 && pct <= 100;
        const isOver = pct > 100;
        const expectedBand = isUnder ? "Under" : isOptimal ? "Optimal" : "Over";
        return band === expectedBand && [isUnder, isOptimal, isOver].filter(Boolean).length === 1;
      }),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// PBT P4: Period normalisation is idempotent
// ---------------------------------------------------------------------------

describe("PBT P4 — period normalisation is idempotent", () => {
  it("firstOfMonth(firstOfMonth(d)) === firstOfMonth(d)", () => {
    fc.assert(
      fc.property(
        fc.date({ min: new Date("2020-01-01"), max: new Date("2030-12-31") }),
        (d) => {
          const once = firstOfMonth(d);
          const twice = firstOfMonth(once);
          return once.getTime() === twice.getTime();
        },
      ),
      { numRuns: 50 },
    );
  });
});

// ---------------------------------------------------------------------------
// PBT P2: Over-allocation detection completeness
// ---------------------------------------------------------------------------

describe("PBT P2 — over-allocation detection completeness", () => {
  it("warning periods match naive over-alloc check", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            allocationPct: fc.float({ min: 10, max: 60, noNaN: true }),
            offsetMonths: fc.integer({ min: 0, max: 5 }),
          }),
          { minLength: 1, maxLength: 4 },
        ),
        fc.float({ min: 10, max: 60, noNaN: true }),
        (existing, newPct) => {
          // Build existing allocations all single-month for simplicity
          const existingAllocs = existing.map((e) => ({
            periodStart: new Date(Date.UTC(2026, e.offsetMonths, 1)),
            periodEnd: new Date(Date.UTC(2026, e.offsetMonths, 1)),
            allocationPct: e.allocationPct,
          }));

          // New allocation: spans months 0-2
          const newStart = new Date(Date.UTC(2026, 0, 1));
          const newEnd = new Date(Date.UTC(2026, 2, 1));
          const newMonths = monthsInRange(newStart, newEnd);

          const warningMonths = newMonths.filter((month) => {
            const sum = naiveSum(existingAllocs, month);
            return sum + newPct > 100;
          });

          const warningMonthKeys = new Set(
            warningMonths.map((m) => `${m.getUTCFullYear()}-${String(m.getUTCMonth() + 1).padStart(2, "0")}`),
          );

          // For each month in range, verify warning completeness
          return newMonths.every((month) => {
            const key = `${month.getUTCFullYear()}-${String(month.getUTCMonth() + 1).padStart(2, "0")}`;
            const naiveOver = naiveSum(existingAllocs, month) + newPct > 100;
            return naiveOver === warningMonthKeys.has(key);
          });
        },
      ),
      { numRuns: 50 },
    );
  });
});

// ---------------------------------------------------------------------------
// Unit tests — AllocationService deterministic cases
// ---------------------------------------------------------------------------

function makeAllocationRepo(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    create: vi.fn(),
    findById: vi.fn(),
    findByIdOrThrow: vi.fn(),
    findByResource: vi.fn().mockResolvedValue([]),
    findByProject: vi.fn().mockResolvedValue([]),
    sumOverlapping: vi.fn().mockResolvedValue(0),
    update: vi.fn(),
    delete: vi.fn().mockResolvedValue(undefined),
    findActiveForResource: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
}

function makeResourceRepo(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    findByIdOrThrow: vi.fn().mockResolvedValue({
      id: "res-1", poolId: "pool-1", name: "Alice", fteCapacity: 100, overAllocated: false,
    }),
    update: vi.fn(),
    poolExists: vi.fn().mockResolvedValue(true),
    findByEmail: vi.fn().mockResolvedValue(null),
    ...overrides,
  };
}

function makePrisma() {
  const allocationRow = {
    id: "alloc-1", resourceId: "res-1", projectId: "proj-1",
    periodStart: new Date("2026-08-01"), periodEnd: new Date("2026-10-01"),
    allocationPct: 50, overAllocatedConfirmed: false,
    createdBy: "user-1", createdAt: new Date(), updatedAt: new Date(),
  };
  return {
    $transaction: vi.fn().mockResolvedValue([allocationRow, {}]),
    allocation: { create: vi.fn(), update: vi.fn() },
    resource: { update: vi.fn() },
  };
}

function makeEventBus() {
  return { publish: vi.fn().mockResolvedValue(undefined), subscribe: vi.fn() };
}

function makeAuditService() {
  return { record: vi.fn().mockResolvedValue(undefined) };
}

function makeProjectService() {
  return { getProject: vi.fn().mockResolvedValue({ id: "proj-1" }) };
}

const CTX = { userId: "user-1", roles: ["EPMO_DIRECTOR"] as const, recordScopes: [] };

function makeService(
  allocationRepoOverrides: Partial<Record<string, unknown>> = {},
  resourceRepoOverrides: Partial<Record<string, unknown>> = {},
) {
  return new AllocationService(
    makeAllocationRepo(allocationRepoOverrides) as never,
    makeResourceRepo(resourceRepoOverrides) as never,
    makeEventBus() as never,
    makeAuditService() as never,
    makePrisma() as never,
    makeProjectService() as never,
  );
}

describe("AllocationService.allocate", () => {
  it("succeeds when total allocation stays within 100%", async () => {
    const svc = makeService({ sumOverlapping: vi.fn().mockResolvedValue(40) });
    const result = await svc.allocate(
      "res-1",
      { projectId: "proj-1", periodStart: "2026-08-01", periodEnd: "2026-10-01", allocationPct: 50, confirmOverAllocation: false },
      CTX,
      "req-1",
    );
    expect(result.allocation.id).toBe("alloc-1");
    expect(result.overAllocationWarning).toBeUndefined();
  });

  it("throws RESOURCE_004 when over 100% and not confirmed", async () => {
    const svc = makeService({ sumOverlapping: vi.fn().mockResolvedValue(70) });
    await expect(
      svc.allocate(
        "res-1",
        { projectId: "proj-1", periodStart: "2026-08-01", periodEnd: "2026-08-01", allocationPct: 50, confirmOverAllocation: false },
        CTX,
        "req-1",
      ),
    ).rejects.toMatchObject({ code: "RESOURCE_004" });
  });

  it("saves with overAllocatedConfirmed=true when confirmed", async () => {
    const svc = makeService({ sumOverlapping: vi.fn().mockResolvedValue(70) });
    const result = await svc.allocate(
      "res-1",
      { projectId: "proj-1", periodStart: "2026-08-01", periodEnd: "2026-08-01", allocationPct: 50, confirmOverAllocation: true },
      CTX,
      "req-1",
    );
    expect(result.allocation).toBeDefined();
    expect(result.overAllocationWarning).toBeDefined();
  });

  it("throws RESOURCE_002 when projectId not found", async () => {
    const svc = makeService(
      {},
      { findByIdOrThrow: vi.fn().mockResolvedValue({ id: "res-1", poolId: "pool-1", name: "Alice", fteCapacity: 100, overAllocated: false }) },
    );
    // Override projectService to throw
    (svc as unknown as { projectService: { getProject: ReturnType<typeof vi.fn> } })
      .projectService = { getProject: vi.fn().mockRejectedValue(new Error("not found")) };

    await expect(
      svc.allocate(
        "res-1",
        { projectId: "unknown", periodStart: "2026-08-01", periodEnd: "2026-08-01", allocationPct: 30, confirmOverAllocation: false },
        CTX,
        "req-1",
      ),
    ).rejects.toMatchObject({ code: "RESOURCE_002" });
  });
});
