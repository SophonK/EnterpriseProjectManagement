import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AuthContext } from "@epm/shared";
import "../../../../../../packages/shared/src/errors/resource-error-codes.js";
import { ResourceService } from "../services/resource.service.js";

// ---------------------------------------------------------------------------
// H1 — createResource / updateResource must verify the caller holds a scope over
// the target pool. These run as a NON-Director (RESOURCE_MANAGER) whose record
// scope covers only "pool-A". A Director bypasses the check.
// ---------------------------------------------------------------------------

const DIRECTOR: AuthContext = { userId: "dir", roles: ["EPMO_DIRECTOR"], recordScopes: [] };
const RM_POOL_A: AuthContext = {
  userId: "rm",
  roles: ["RESOURCE_MANAGER"],
  recordScopes: [{ type: "resource-pool", ids: ["pool-A"] }],
};

function makeDeps() {
  const resourceRepo = {
    poolExists: vi.fn().mockResolvedValue(true),
    findByEmail: vi.fn().mockResolvedValue(null),
    create: vi.fn(async (d: { poolId: string }) => ({ id: "res-1", poolId: d.poolId, name: "X" })),
    findByIdOrThrow: vi.fn(async () => ({ id: "res-1", poolId: "pool-A", name: "X", email: "x@e.com" })),
    update: vi.fn(async (_id: string, d: { poolId?: string }) => ({ id: "res-1", poolId: d.poolId ?? "pool-A" })),
    listPools: vi.fn().mockResolvedValue([{ id: "pool-A", name: "Eng" }]),
    createPool: vi.fn(async (name: string) => ({ id: "pool-new", name })),
  };
  const allocationRepo = { findActiveForResource: vi.fn().mockResolvedValue([]) };
  const capacityPeriodRepo = { upsert: vi.fn(async () => ({ id: "cp-1", resourceId: "res-1", periodStart: "2026-08-01", capacityPct: 80 })) };
  const auditService = { record: vi.fn().mockResolvedValue(undefined) };
  const service = new ResourceService(
    resourceRepo as never,
    allocationRepo as never,
    capacityPeriodRepo as never,
    auditService as never,
  );
  return { service, resourceRepo, allocationRepo, capacityPeriodRepo, auditService };
}

const createCmd = (poolId: string) => ({
  name: "Alice",
  email: "alice@example.com",
  poolId,
  fteCapacity: 100,
  skills: [],
});

describe("ResourceService.createResource — pool-scope enforcement (H1)", () => {
  let deps: ReturnType<typeof makeDeps>;
  beforeEach(() => {
    deps = makeDeps();
  });

  it("RESOURCE_MANAGER scoped to pool-A CAN create in pool-A", async () => {
    const res = await deps.service.createResource(createCmd("pool-A"), RM_POOL_A, "req");
    expect(res.poolId).toBe("pool-A");
    expect(deps.resourceRepo.create).toHaveBeenCalledTimes(1);
  });

  it("RESOURCE_MANAGER NOT scoped to pool-B is REJECTED with RESOURCE_006", async () => {
    await expect(deps.service.createResource(createCmd("pool-B"), RM_POOL_A, "req")).rejects.toMatchObject({
      code: "RESOURCE_006",
    });
    expect(deps.resourceRepo.create).not.toHaveBeenCalled();
  });

  it("EPMO_DIRECTOR bypasses the pool-scope check", async () => {
    const res = await deps.service.createResource(createCmd("pool-Z"), DIRECTOR, "req");
    expect(res.poolId).toBe("pool-Z");
  });
});

describe("ResourceService.updateResource — pool move scope enforcement (H1)", () => {
  let deps: ReturnType<typeof makeDeps>;
  beforeEach(() => {
    deps = makeDeps();
  });

  it("moving a resource into an out-of-scope pool is REJECTED with RESOURCE_006", async () => {
    await expect(
      deps.service.updateResource("res-1", { poolId: "pool-B" }, RM_POOL_A, "req"),
    ).rejects.toMatchObject({ code: "RESOURCE_006" });
    expect(deps.resourceRepo.update).not.toHaveBeenCalled();
  });

  it("moving a resource into an in-scope pool succeeds", async () => {
    const res = await deps.service.updateResource("res-1", { poolId: "pool-A" }, RM_POOL_A, "req");
    // current pool is already pool-A, so no move — still succeeds
    expect(res).toBeDefined();
  });
});

describe("ResourceService.createPool — Director-only (api-spec)", () => {
  let deps: ReturnType<typeof makeDeps>;
  beforeEach(() => {
    deps = makeDeps();
  });

  it("a non-Director resource:write holder cannot create a pool", async () => {
    await expect(deps.service.createPool({ name: "New" }, RM_POOL_A, "req")).rejects.toMatchObject({
      code: "RESOURCE_006",
    });
    expect(deps.resourceRepo.createPool).not.toHaveBeenCalled();
  });

  it("EPMO_DIRECTOR can create a pool", async () => {
    const pool = await deps.service.createPool({ name: "New" }, DIRECTOR, "req");
    expect(pool.name).toBe("New");
    expect(deps.auditService.record).toHaveBeenCalled();
  });

  it("listPools returns pools", async () => {
    const pools = await deps.service.listPools();
    expect(pools).toHaveLength(1);
  });
});

describe("ResourceService.setCapacityPeriod — reachable upsert (BR-2)", () => {
  it("upserts a capacity override after a scoped resource lookup", async () => {
    const deps = makeDeps();
    const cp = await deps.service.setCapacityPeriod("res-1", { periodStart: "2026-08-15", capacityPct: 80 }, RM_POOL_A, "req");
    expect(cp.capacityPct).toBe(80);
    // BR-5: periodStart normalised to first-of-month before persisting.
    expect(deps.capacityPeriodRepo.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ resourceId: "res-1" }),
    );
    const arg = deps.capacityPeriodRepo.upsert.mock.calls[0]![0] as { periodStart: Date };
    expect(arg.periodStart.toISOString().slice(0, 10)).toBe("2026-08-01");
  });
});
