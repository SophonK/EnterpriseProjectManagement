import { describe, it, expect, vi } from "vitest";
import fc from "fast-check";
import { AppError } from "@epm/shared";
import type { AuthContext } from "@epm/shared";
import "../../../../../../packages/shared/src/errors/resource-error-codes.js";
import {
  AllocationService,
  firstOfMonth,
  monthsInRange,
  utilizationBand,
} from "../services/allocation.service.js";
import { RESOURCE_MANAGEMENT_EVENTS } from "@epm/shared";

// ---------------------------------------------------------------------------
// In-memory harness: a shared allocation store stands in for the DB boundary.
// The REAL AllocationService runs against it — repo `sumOverlapping` and the
// prisma `allocation.*`/`resource.update` mocks read/write the same rows — so
// correctness.md P1/P2 and BR-6 are verified against real service code, not a
// naive reimplementation asserted against itself.
// ---------------------------------------------------------------------------

interface Row {
  id: string;
  resourceId: string;
  projectId: string;
  periodStart: Date;
  periodEnd: Date;
  allocationPct: number;
  overAllocatedConfirmed: boolean;
  archived: boolean;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

function rowToDTO(r: Row) {
  return {
    id: r.id,
    resourceId: r.resourceId,
    projectId: r.projectId,
    periodStart: r.periodStart.toISOString().slice(0, 10),
    periodEnd: r.periodEnd.toISOString().slice(0, 10),
    allocationPct: r.allocationPct,
    overAllocatedConfirmed: r.overAllocatedConfirmed,
    createdBy: r.createdBy,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

const CTX_RM: AuthContext = {
  userId: "user-1",
  roles: ["RESOURCE_MANAGER"],
  recordScopes: [{ type: "resource-pool", ids: ["pool-1"] }],
};

function makeHarness() {
  const store: Row[] = [];
  let seq = 0;

  const seedAllocation = (data: Partial<Row> & { resourceId: string; periodStart: Date; periodEnd: Date; allocationPct: number }): Row => {
    const now = new Date();
    const row: Row = {
      id: `alloc-${++seq}`,
      projectId: "proj-1",
      overAllocatedConfirmed: false,
      archived: false,
      createdBy: "user-1",
      createdAt: now,
      updatedAt: now,
      ...data,
    };
    store.push(row);
    return row;
  };

  const allocationRepo = {
    sumOverlapping: vi.fn(async (resourceId: string, month: Date, excludeId?: string) =>
      store
        .filter(
          (a) =>
            a.resourceId === resourceId &&
            !a.archived &&
            a.periodStart <= month &&
            a.periodEnd >= month &&
            a.id !== excludeId,
        )
        .reduce((s, a) => s + a.allocationPct, 0),
    ),
    findByIdOrThrow: vi.fn(async (id: string, resourceId: string) => {
      const r = store.find((a) => a.id === id && a.resourceId === resourceId);
      if (!r) throw new AppError("RESOURCE_005", `Allocation ${id} not found`);
      return rowToDTO(r);
    }),
    findActiveForResource: vi.fn(async (resourceId: string, from: Date) =>
      store.filter((a) => a.resourceId === resourceId && !a.archived && a.periodEnd >= from).map(rowToDTO),
    ),
    delete: vi.fn(async (id: string) => {
      const i = store.findIndex((a) => a.id === id);
      if (i >= 0) store.splice(i, 1);
    }),
    findByResource: vi.fn().mockResolvedValue([]),
    findByProject: vi.fn().mockResolvedValue([]),
    findOverlappingForResources: vi.fn().mockResolvedValue([]),
    create: vi.fn(),
    update: vi.fn(),
  };

  const resourceUpdateCalls: Array<{ overAllocated: boolean }> = [];

  const prisma = {
    $transaction: vi.fn(async (arr: unknown[]) => arr),
    allocation: {
      create: vi.fn((args: { data: Record<string, unknown> }) =>
        seedAllocation({
          resourceId: args.data.resourceId as string,
          projectId: args.data.projectId as string,
          periodStart: args.data.periodStart as Date,
          periodEnd: args.data.periodEnd as Date,
          allocationPct: Number(args.data.allocationPct),
          overAllocatedConfirmed: args.data.overAllocatedConfirmed as boolean,
          createdBy: args.data.createdBy as string,
        }),
      ),
      update: vi.fn((args: { where: { id: string }; data: Record<string, unknown> }) => {
        const r = store.find((a) => a.id === args.where.id)!;
        if (args.data.periodStart !== undefined) r.periodStart = args.data.periodStart as Date;
        if (args.data.periodEnd !== undefined) r.periodEnd = args.data.periodEnd as Date;
        if (args.data.allocationPct !== undefined) r.allocationPct = Number(args.data.allocationPct);
        if (args.data.overAllocatedConfirmed !== undefined)
          r.overAllocatedConfirmed = args.data.overAllocatedConfirmed as boolean;
        r.updatedAt = new Date();
        return r;
      }),
    },
    resource: {
      update: vi.fn((args: { data: { overAllocated: boolean } }) => {
        resourceUpdateCalls.push({ overAllocated: args.data.overAllocated });
        return {};
      }),
    },
  };

  const resourceRepo = {
    findByIdOrThrow: vi.fn(async () => ({
      id: "res-1",
      poolId: "pool-1",
      name: "Alice",
      fteCapacity: 100,
      overAllocated: false,
    })),
  };

  const eventBus = { publish: vi.fn().mockResolvedValue(undefined), subscribe: vi.fn() };
  const auditService = { record: vi.fn().mockResolvedValue(undefined) };
  const projectService = { getProject: vi.fn().mockResolvedValue({ id: "proj-1" }) };

  const service = new AllocationService(
    allocationRepo as never,
    resourceRepo as never,
    eventBus as never,
    auditService as never,
    prisma as never,
    projectService as never,
  );

  return { store, seedAllocation, service, eventBus, auditService, projectService, resourceRepo, resourceUpdateCalls };
}

const thisMonth = firstOfMonth(new Date());
function ym(monthIdx: number): string {
  return `2026-${String(monthIdx + 1).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// PBT P1 — allocation sum is correct and order-independent (drives real service)
// ---------------------------------------------------------------------------

describe("PBT P1 — allocation sum equals naive sum, independent of insertion order", () => {
  it("the real service's per-month existing total matches naive summation, both orders", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            allocationPct: fc.float({ min: 1, max: 50, noNaN: true }),
            offsetMonths: fc.integer({ min: 0, max: 5 }),
            durationMonths: fc.integer({ min: 1, max: 4 }),
          }),
          { minLength: 1, maxLength: 8 },
        ),
        async (entries) => {
          const naive = (monthIdx: number): number =>
            entries
              .filter((e) => e.offsetMonths <= monthIdx && e.offsetMonths + e.durationMonths - 1 >= monthIdx)
              .reduce((s, e) => s + e.allocationPct, 0);

          // Drive the REAL service: a pct=100 probe allocation over months 0..5 makes the
          // service report each overlapping month's existing total as warning.totalPct - 100.
          const probe = async (order: typeof entries): Promise<Map<number, number>> => {
            const h = makeHarness();
            for (const e of order) {
              h.seedAllocation({
                resourceId: "res-1",
                periodStart: new Date(Date.UTC(2026, e.offsetMonths, 1)),
                periodEnd: new Date(Date.UTC(2026, e.offsetMonths + e.durationMonths - 1, 1)),
                allocationPct: e.allocationPct,
              });
            }
            const res = await h.service.allocate(
              "res-1",
              { projectId: "proj-1", periodStart: "2026-01-01", periodEnd: "2026-06-01", allocationPct: 100, confirmOverAllocation: true },
              CTX_RM,
              "req",
            );
            const map = new Map<number, number>();
            for (const p of res.overAllocationWarning?.periods ?? []) {
              const idx = Number(p.month.slice(5)) - 1;
              map.set(idx, p.totalPct - 100);
            }
            return map;
          };

          const forward = await probe(entries);
          const reversed = await probe([...entries].reverse());

          for (let idx = 0; idx <= 5; idx++) {
            const expected = naive(idx);
            if (Math.abs((forward.get(idx) ?? 0) - expected) > 1e-6) return false;
            if (Math.abs((reversed.get(idx) ?? 0) - expected) > 1e-6) return false;
          }
          return true;
        },
      ),
      { numRuns: 40 },
    );
  });
});

// ---------------------------------------------------------------------------
// PBT P2 — over-allocation detection completeness (drives real service)
// ---------------------------------------------------------------------------

describe("PBT P2 — service warning periods ⇔ naive over-allocation per month", () => {
  it("a month appears in the real service's warning iff existing+new > 100", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            allocationPct: fc.float({ min: 10, max: 60, noNaN: true }),
            offsetMonths: fc.integer({ min: 0, max: 2 }),
          }),
          { minLength: 1, maxLength: 4 },
        ),
        fc.float({ min: 10, max: 60, noNaN: true }),
        async (existing, newPct) => {
          const h = makeHarness();
          for (const e of existing) {
            const m = new Date(Date.UTC(2026, e.offsetMonths, 1));
            h.seedAllocation({ resourceId: "res-1", periodStart: m, periodEnd: m, allocationPct: e.allocationPct });
          }
          const res = await h.service.allocate(
            "res-1",
            { projectId: "proj-1", periodStart: "2026-01-01", periodEnd: "2026-03-01", allocationPct: newPct, confirmOverAllocation: true },
            CTX_RM,
            "req",
          );
          const warned = new Set((res.overAllocationWarning?.periods ?? []).map((p) => p.month));
          for (let idx = 0; idx <= 2; idx++) {
            const naiveSum = existing.filter((e) => e.offsetMonths === idx).reduce((s, e) => s + e.allocationPct, 0);
            const expectedOver = naiveSum + newPct > 100;
            if (expectedOver !== warned.has(ym(idx))) return false;
          }
          return true;
        },
      ),
      { numRuns: 50 },
    );
  });
});

// ---------------------------------------------------------------------------
// PBT P3 / P4 — pure exported logic (band exhaustiveness, normalisation idempotency)
// ---------------------------------------------------------------------------

describe("PBT P3 — utilization band exhaustive and non-overlapping", () => {
  it("every non-negative value maps to exactly one band", () => {
    fc.assert(
      fc.property(fc.float({ min: 0, max: 300, noNaN: true }), (pct) => {
        const band = utilizationBand(pct);
        const isUnder = pct < 80;
        const isOptimal = pct >= 80 && pct <= 100;
        const isOver = pct > 100;
        const expected = isUnder ? "Under" : isOptimal ? "Optimal" : "Over";
        return band === expected && [isUnder, isOptimal, isOver].filter(Boolean).length === 1;
      }),
      { numRuns: 100 },
    );
  });
});

describe("PBT P4 — period normalisation is idempotent", () => {
  it("firstOfMonth(firstOfMonth(d)) === firstOfMonth(d)", () => {
    fc.assert(
      fc.property(fc.date({ min: new Date("2020-01-01"), max: new Date("2030-12-31") }), (d) => {
        const once = firstOfMonth(d);
        return once.getTime() === firstOfMonth(once).getTime();
      }),
      { numRuns: 50 },
    );
  });
});

// ---------------------------------------------------------------------------
// Deterministic — allocate
// ---------------------------------------------------------------------------

describe("AllocationService.allocate", () => {
  it("succeeds and publishes resource.allocated when within capacity", async () => {
    const h = makeHarness();
    h.seedAllocation({
      resourceId: "res-1",
      periodStart: new Date("2026-08-01"),
      periodEnd: new Date("2026-10-01"),
      allocationPct: 40,
    });
    const res = await h.service.allocate(
      "res-1",
      { projectId: "proj-1", periodStart: "2026-08-01", periodEnd: "2026-10-01", allocationPct: 50, confirmOverAllocation: false },
      CTX_RM,
      "req",
    );
    expect(res.overAllocationWarning).toBeUndefined();
    const allocatedEvents = h.eventBus.publish.mock.calls.filter(
      (c) => (c[0] as { eventType: string }).eventType === RESOURCE_MANAGEMENT_EVENTS.RESOURCE_ALLOCATED,
    );
    expect(allocatedEvents).toHaveLength(1);
  });

  it("throws RESOURCE_004 when over 100% and not confirmed", async () => {
    const h = makeHarness();
    h.seedAllocation({ resourceId: "res-1", periodStart: new Date("2026-08-01"), periodEnd: new Date("2026-08-01"), allocationPct: 70 });
    await expect(
      h.service.allocate(
        "res-1",
        { projectId: "proj-1", periodStart: "2026-08-01", periodEnd: "2026-08-01", allocationPct: 50, confirmOverAllocation: false },
        CTX_RM,
        "req",
      ),
    ).rejects.toMatchObject({ code: "RESOURCE_004" });
  });

  it("saves and publishes resource.over-allocated when confirmed over 100%", async () => {
    const h = makeHarness();
    h.seedAllocation({ resourceId: "res-1", periodStart: new Date("2026-08-01"), periodEnd: new Date("2026-08-01"), allocationPct: 70 });
    const res = await h.service.allocate(
      "res-1",
      { projectId: "proj-1", periodStart: "2026-08-01", periodEnd: "2026-08-01", allocationPct: 50, confirmOverAllocation: true },
      CTX_RM,
      "req",
    );
    expect(res.overAllocationWarning?.periods.map((p) => p.month)).toContain("2026-08");
    const overEvents = h.eventBus.publish.mock.calls.filter(
      (c) => (c[0] as { eventType: string }).eventType === RESOURCE_MANAGEMENT_EVENTS.RESOURCE_OVER_ALLOCATED,
    );
    expect(overEvents).toHaveLength(1);
  });

  it("throws RESOURCE_002 when projectId not found / out of scope", async () => {
    const h = makeHarness();
    h.projectService.getProject = vi.fn().mockRejectedValue(new Error("not found"));
    await expect(
      h.service.allocate(
        "res-1",
        { projectId: "unknown", periodStart: "2026-08-01", periodEnd: "2026-08-01", allocationPct: 30, confirmOverAllocation: false },
        CTX_RM,
        "req",
      ),
    ).rejects.toMatchObject({ code: "RESOURCE_002" });
  });
});

// ---------------------------------------------------------------------------
// H3 — updateAllocation publishes events
// ---------------------------------------------------------------------------

describe("AllocationService.updateAllocation — event publication (H3)", () => {
  it("publishes resource.allocated on a plain update (non-Director caller)", async () => {
    const h = makeHarness();
    const row = h.seedAllocation({ resourceId: "res-1", periodStart: new Date("2026-08-01"), periodEnd: new Date("2026-08-01"), allocationPct: 30 });
    h.eventBus.publish.mockClear();
    await h.service.updateAllocation(row.id, "res-1", { allocationPct: 40 }, CTX_RM, "req");
    const types = h.eventBus.publish.mock.calls.map((c) => (c[0] as { eventType: string }).eventType);
    expect(types).toContain(RESOURCE_MANAGEMENT_EVENTS.RESOURCE_ALLOCATED);
    expect(types).not.toContain(RESOURCE_MANAGEMENT_EVENTS.RESOURCE_OVER_ALLOCATED);
  });

  it("publishes BOTH resource.allocated and resource.over-allocated when the update crosses 100%", async () => {
    const h = makeHarness();
    h.seedAllocation({ resourceId: "res-1", periodStart: new Date("2026-08-01"), periodEnd: new Date("2026-08-01"), allocationPct: 70 });
    const target = h.seedAllocation({ resourceId: "res-1", periodStart: new Date("2026-08-01"), periodEnd: new Date("2026-08-01"), allocationPct: 10 });
    h.eventBus.publish.mockClear();
    const res = await h.service.updateAllocation(target.id, "res-1", { allocationPct: 50, confirmOverAllocation: true }, CTX_RM, "req");
    expect(res.overAllocationWarning?.periods.map((p) => p.month)).toContain("2026-08");
    const types = h.eventBus.publish.mock.calls.map((c) => (c[0] as { eventType: string }).eventType);
    expect(types).toContain(RESOURCE_MANAGEMENT_EVENTS.RESOURCE_ALLOCATED);
    expect(types).toContain(RESOURCE_MANAGEMENT_EVENTS.RESOURCE_OVER_ALLOCATED);
  });

  it("throws RESOURCE_004 when the update would over-allocate and is not confirmed", async () => {
    const h = makeHarness();
    h.seedAllocation({ resourceId: "res-1", periodStart: new Date("2026-08-01"), periodEnd: new Date("2026-08-01"), allocationPct: 70 });
    const target = h.seedAllocation({ resourceId: "res-1", periodStart: new Date("2026-08-01"), periodEnd: new Date("2026-08-01"), allocationPct: 10 });
    await expect(
      h.service.updateAllocation(target.id, "res-1", { allocationPct: 50 }, CTX_RM, "req"),
    ).rejects.toMatchObject({ code: "RESOURCE_004" });
  });
});

// ---------------------------------------------------------------------------
// BR-6 — overAllocated flag recompute must be able to CLEAR to false
// ---------------------------------------------------------------------------

describe("AllocationService — overAllocated flag recompute (BR-6)", () => {
  it("delete of the last over-alloc contributor CLEARS the flag to false", async () => {
    const h = makeHarness();
    const a = h.seedAllocation({ resourceId: "res-1", periodStart: thisMonth, periodEnd: thisMonth, allocationPct: 60 });
    h.seedAllocation({ resourceId: "res-1", periodStart: thisMonth, periodEnd: thisMonth, allocationPct: 60 });
    await h.service.deleteAllocation(a.id, "res-1", CTX_RM, "req");
    expect(h.resourceUpdateCalls.at(-1)).toEqual({ overAllocated: false });
  });

  it("delete keeps the flag true while another month is still over 100%", async () => {
    const h = makeHarness();
    const a = h.seedAllocation({ resourceId: "res-1", periodStart: thisMonth, periodEnd: thisMonth, allocationPct: 60 });
    h.seedAllocation({ resourceId: "res-1", periodStart: thisMonth, periodEnd: thisMonth, allocationPct: 60 });
    h.seedAllocation({ resourceId: "res-1", periodStart: thisMonth, periodEnd: thisMonth, allocationPct: 60 });
    await h.service.deleteAllocation(a.id, "res-1", CTX_RM, "req");
    expect(h.resourceUpdateCalls.at(-1)).toEqual({ overAllocated: true });
  });

  it("an update that REDUCES the total clears the flag to false", async () => {
    const h = makeHarness();
    h.seedAllocation({ resourceId: "res-1", periodStart: thisMonth, periodEnd: thisMonth, allocationPct: 60 });
    const b = h.seedAllocation({ resourceId: "res-1", periodStart: thisMonth, periodEnd: thisMonth, allocationPct: 60 });
    await h.service.updateAllocation(b.id, "res-1", { allocationPct: 10 }, CTX_RM, "req");
    expect(h.resourceUpdateCalls.at(-1)).toEqual({ overAllocated: false });
  });
});

// ---------------------------------------------------------------------------
// H2 — archived allocations are excluded from active totals
// ---------------------------------------------------------------------------

describe("AllocationService — archived allocations excluded (H2)", () => {
  it("an archived allocation does not count toward the over-allocation total", async () => {
    const h = makeHarness();
    // 70% belongs to an archived project — must be ignored.
    h.seedAllocation({ resourceId: "res-1", periodStart: new Date("2026-08-01"), periodEnd: new Date("2026-08-01"), allocationPct: 70, archived: true });
    const res = await h.service.allocate(
      "res-1",
      { projectId: "proj-1", periodStart: "2026-08-01", periodEnd: "2026-08-01", allocationPct: 50, confirmOverAllocation: false },
      CTX_RM,
      "req",
    );
    // 50 (+ 0 active) ≤ 100 → no over-allocation despite the 70 archived row.
    expect(res.overAllocationWarning).toBeUndefined();
  });
});

// Anchor monthsInRange import (used by harness reasoning) — sanity of the helper.
describe("monthsInRange", () => {
  it("is inclusive of both endpoint months", () => {
    const months = monthsInRange(new Date("2026-01-01"), new Date("2026-03-01"));
    expect(months).toHaveLength(3);
  });
});
