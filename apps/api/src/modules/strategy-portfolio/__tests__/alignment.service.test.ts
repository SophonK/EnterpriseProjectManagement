import { describe, it, expect, vi } from "vitest";
import "../../../../../../packages/shared/src/errors/strategy-error-codes.js";
import { AlignmentService } from "../services/alignment.service.js";
import type { AuthContext } from "@epm/shared";

const CTX: AuthContext = { userId: "user-1", roles: ["EPMO_DIRECTOR"], recordScopes: [] };

function makeEventBus() {
  return { publish: vi.fn().mockResolvedValue(undefined), subscribe: vi.fn() };
}

function makeViewRecord(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    projectId: "proj-1",
    name: "Proj",
    status: "Active",
    plannedBudget: null,
    portfolioId: "port-1",
    programId: null,
    aligned: false,
    lastEventAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("AlignmentService.evaluateAlignment — BR-103 / BR-104", () => {
  it("BR-103: aligned = true and no flag when >= 1 link exists", async () => {
    const eventBus = makeEventBus();
    const viewRepo = {
      findByProject: vi.fn().mockResolvedValue(makeViewRecord({ status: "Active" })),
      setAligned: vi.fn().mockResolvedValue(undefined),
    };
    const svc = new AlignmentService(
      { countByProject: vi.fn().mockResolvedValue(2) } as never,
      viewRepo as never,
      eventBus as never,
    );

    const aligned = await svc.evaluateAlignment("proj-1");

    expect(aligned).toBe(true);
    expect(viewRepo.setAligned).toHaveBeenCalledWith("proj-1", true);
    expect(eventBus.publish).not.toHaveBeenCalled();
  });

  it("BR-104: an active + unaligned project sets aligned=false and publishes flagged-unaligned", async () => {
    const eventBus = makeEventBus();
    const viewRepo = {
      findByProject: vi.fn().mockResolvedValue(makeViewRecord({ status: "Active", portfolioId: "port-9" })),
      setAligned: vi.fn().mockResolvedValue(undefined),
    };
    const svc = new AlignmentService(
      { countByProject: vi.fn().mockResolvedValue(0) } as never,
      viewRepo as never,
      eventBus as never,
    );

    const aligned = await svc.evaluateAlignment("proj-1");

    expect(aligned).toBe(false);
    expect(viewRepo.setAligned).toHaveBeenCalledWith("proj-1", false);
    expect(eventBus.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "strategy-portfolio.project.flagged-unaligned",
        data: expect.objectContaining({ projectId: "proj-1", portfolioId: "port-9" }),
      }),
    );
  });

  it("does NOT flag a non-active unaligned project", async () => {
    const eventBus = makeEventBus();
    const viewRepo = {
      findByProject: vi.fn().mockResolvedValue(makeViewRecord({ status: "Open" })),
      setAligned: vi.fn().mockResolvedValue(undefined),
    };
    const svc = new AlignmentService(
      { countByProject: vi.fn().mockResolvedValue(0) } as never,
      viewRepo as never,
      eventBus as never,
    );

    await svc.evaluateAlignment("proj-1");
    expect(eventBus.publish).not.toHaveBeenCalled();
  });
});

describe("AlignmentService.listUnaligned — BR-109 surface unaligned work", () => {
  it("returns fullyAligned=true with empty items when nothing is unaligned", async () => {
    const svc = new AlignmentService(
      { countByProject: vi.fn() } as never,
      { listUnaligned: vi.fn().mockResolvedValue([]) } as never,
      makeEventBus() as never,
    );

    const report = await svc.listUnaligned(CTX);
    expect(report.fullyAligned).toBe(true);
    expect(report.items).toEqual([]);
  });

  it("lists unaligned projects enriched with owner + portfolio and fullyAligned=false", async () => {
    const svc = new AlignmentService(
      { countByProject: vi.fn() } as never,
      {
        listUnaligned: vi.fn().mockResolvedValue([
          {
            projectId: "proj-1",
            name: "Proj",
            portfolioId: "port-1",
            portfolioName: "Growth",
            ownerId: "owner-1",
          },
        ]),
      } as never,
      makeEventBus() as never,
    );

    const report = await svc.listUnaligned(CTX);
    expect(report.fullyAligned).toBe(false);
    expect(report.items).toEqual([
      {
        projectId: "proj-1",
        name: "Proj",
        ownerId: "owner-1",
        portfolioId: "port-1",
        portfolioName: "Growth",
      },
    ]);
  });
});
