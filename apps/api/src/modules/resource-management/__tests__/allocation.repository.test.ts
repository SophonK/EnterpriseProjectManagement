import { describe, it, expect, vi } from "vitest";
import { AllocationRepository } from "../repositories/allocation.repository.js";

// ---------------------------------------------------------------------------
// H2 — the real exclusion mechanism: sumOverlapping / findActiveForResource /
// findOverlappingForResources must filter `archived = false` in the DB query so
// archived-project allocations never enter active utilization/over-allocation.
// These assert the WHERE the repo actually sends to Prisma.
// ---------------------------------------------------------------------------

function makeRepo() {
  const prisma = {
    allocation: {
      aggregate: vi.fn().mockResolvedValue({ _sum: { allocationPct: null } }),
      findMany: vi.fn().mockResolvedValue([]),
    },
  };
  const repo = new AllocationRepository(prisma as never);
  return { repo, prisma };
}

describe("AllocationRepository — archived exclusion (H2)", () => {
  it("sumOverlapping filters archived: false", async () => {
    const { repo, prisma } = makeRepo();
    await repo.sumOverlapping("res-1", new Date("2026-08-01"));
    const arg = prisma.allocation.aggregate.mock.calls[0]![0] as { where: Record<string, unknown> };
    expect(arg.where.archived).toBe(false);
    expect(arg.where.resourceId).toBe("res-1");
  });

  it("findActiveForResource filters archived: false", async () => {
    const { repo, prisma } = makeRepo();
    await repo.findActiveForResource("res-1", new Date("2026-08-01"));
    const arg = prisma.allocation.findMany.mock.calls[0]![0] as { where: Record<string, unknown> };
    expect(arg.where.archived).toBe(false);
  });

  it("findOverlappingForResources filters archived: false and skips the query when no ids", async () => {
    const { repo, prisma } = makeRepo();
    const empty = await repo.findOverlappingForResources([], new Date("2026-08-01"), new Date("2026-10-01"));
    expect(empty).toEqual([]);
    expect(prisma.allocation.findMany).not.toHaveBeenCalled();

    await repo.findOverlappingForResources(["res-1"], new Date("2026-08-01"), new Date("2026-10-01"));
    const arg = prisma.allocation.findMany.mock.calls[0]![0] as { where: Record<string, unknown> };
    expect(arg.where.archived).toBe(false);
    expect(arg.where.resourceId).toEqual({ in: ["res-1"] });
  });
});
