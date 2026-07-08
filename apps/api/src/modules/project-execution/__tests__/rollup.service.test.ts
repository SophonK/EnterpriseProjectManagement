import { describe, it, expect, vi } from "vitest";
import fc from "fast-check";
import { RollupService } from "../services/rollup.service.js";
import type { ProjectHealth } from "@epm/shared";

// ---------------------------------------------------------------------------
// PBT P3 — roll-up count consistency
// ---------------------------------------------------------------------------

function makeRollupRepo() {
  return { upsert: vi.fn(), find: vi.fn() };
}

function makeEventBus() {
  return { publish: vi.fn().mockResolvedValue(undefined), subscribe: vi.fn() };
}

function makePrismaWithHealthCounts(healthValues: ProjectHealth[]) {
  const grouped: Record<string, number> = {};
  for (const h of healthValues) grouped[h] = (grouped[h] ?? 0) + 1;

  return {
    project: {
      groupBy: vi.fn().mockResolvedValue(
        Object.entries(grouped).map(([health, count]) => ({
          health,
          _count: { health: count },
        })),
      ),
    },
  };
}

describe("PBT P3 — roll-up count consistency", () => {
  it("onTrack + atRisk + offTrack === total for any health distribution", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.constantFrom<ProjectHealth>("OnTrack", "AtRisk", "OffTrack"),
          { minLength: 0, maxLength: 50 },
        ),
        async (healthValues) => {
          const rollupRepo = makeRollupRepo();
          rollupRepo.upsert.mockImplementation(async (data: Record<string, unknown>) => ({
            ...data, computedAt: new Date().toISOString(),
          }));

          const svc = new RollupService(
            rollupRepo as never,
            makePrismaWithHealthCounts(healthValues) as never,
            makeEventBus() as never,
          );

          const result = await svc.recomputeRollup("port-1", null);

          expect(result.onTrackCount + result.atRiskCount + result.offTrackCount)
            .toBe(result.totalCount);
          expect(result.onTrackCount)
            .toBe(healthValues.filter((h) => h === "OnTrack").length);
          expect(result.atRiskCount)
            .toBe(healthValues.filter((h) => h === "AtRisk").length);
          expect(result.offTrackCount)
            .toBe(healthValues.filter((h) => h === "OffTrack").length);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("totalCount is 0 for empty portfolio", async () => {
    const rollupRepo = makeRollupRepo();
    rollupRepo.upsert.mockImplementation(async (data: Record<string, unknown>) => ({
      ...data, computedAt: new Date().toISOString(),
    }));

    const svc = new RollupService(
      rollupRepo as never,
      makePrismaWithHealthCounts([]) as never,
      makeEventBus() as never,
    );

    const result = await svc.recomputeRollup("port-1", null);
    expect(result.totalCount).toBe(0);
  });

  it("publishes RollupRecomputed event after upsert", async () => {
    const rollupRepo = makeRollupRepo();
    rollupRepo.upsert.mockImplementation(async (data: Record<string, unknown>) => ({
      ...data, computedAt: new Date().toISOString(),
    }));
    const eventBus = makeEventBus();

    const svc = new RollupService(
      rollupRepo as never,
      makePrismaWithHealthCounts(["OnTrack", "AtRisk"]) as never,
      eventBus as never,
    );

    await svc.recomputeRollup("port-1", null);
    expect(eventBus.publish).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "project-execution.rollup.recomputed" }),
    );
  });
});
