import { describe, it, expect, vi } from "vitest";
import "../../../../../../packages/shared/src/errors/demand-error-codes.js";
import { PromotionService } from "../services/promotion.service.js";
import type { AuthContext, DemandRequestDTO } from "@epm/shared";

const CTX: AuthContext = { userId: "user-1", roles: ["PORTFOLIO_MANAGER"], recordScopes: [] };

function makeDemandDTO(overrides: Partial<DemandRequestDTO> = {}): DemandRequestDTO {
  return {
    id: "demand-1",
    title: "New CRM",
    sponsor: "VP Sales",
    description: "Replace legacy CRM",
    expectedValue: null,
    status: "Approved",
    currentGate: "Approved",
    rejectionReason: null,
    submittedBy: "user-1",
    submittedAt: new Date().toISOString(),
    promotedProjectId: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeDemandRepo(request: DemandRequestDTO) {
  return {
    findByIdScoped: vi.fn().mockResolvedValue(request),
    updateStatusGate: vi
      .fn()
      .mockImplementation(async (_id: string, data: { status: string }) =>
        makeDemandDTO({ ...request, status: data.status as DemandRequestDTO["status"] }),
      ),
  };
}

function makeEventBus() {
  return { publish: vi.fn().mockResolvedValue(undefined), subscribe: vi.fn() };
}

function makeAudit() {
  return { record: vi.fn().mockResolvedValue(undefined) };
}

const PROMOTE_CMD = {
  portfolioId: "11111111-1111-1111-1111-111111111111",
  programId: "22222222-2222-2222-2222-222222222222",
  plannedStart: "2026-08-01",
  plannedEnd: "2026-12-31",
  plannedBudget: 500000,
};

describe("PromotionService.promoteToProject — BR-208", () => {
  it("requires Approved; sets status = Promoted; publishes the EXACT demand.promoted payload", async () => {
    const repo = makeDemandRepo(makeDemandDTO({ status: "Approved" }));
    const eventBus = makeEventBus();
    const audit = makeAudit();
    const svc = new PromotionService(repo as never, eventBus as never, audit as never);

    const dto = await svc.promoteToProject("demand-1", PROMOTE_CMD, CTX, "req-1");

    expect(dto.status).toBe("Promoted");
    expect(repo.updateStatusGate).toHaveBeenCalledWith(
      "demand-1",
      expect.objectContaining({ status: "Promoted" }),
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "update", entityType: "demand-request" }),
    );
    // name defaults from the demand title; payload byte-matches DemandPromotedPayload
    expect(eventBus.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "demand-intake.demand.promoted",
        source: "demand-intake",
        data: {
          demandId: "demand-1",
          name: "New CRM",
          portfolioId: "11111111-1111-1111-1111-111111111111",
          programId: "22222222-2222-2222-2222-222222222222",
          plannedStart: "2026-08-01",
          plannedEnd: "2026-12-31",
          plannedBudget: 500000,
        },
      }),
    );
  });

  it.each(["Submitted", "Screening", "Evaluation", "Promoted", "Rejected"] as const)(
    "throws DEMAND_006 and does not mutate/publish when status is %s",
    async (status) => {
      const repo = makeDemandRepo(makeDemandDTO({ status }));
      const eventBus = makeEventBus();
      const svc = new PromotionService(repo as never, eventBus as never, makeAudit() as never);

      await expect(
        svc.promoteToProject("demand-1", PROMOTE_CMD, CTX, "req-1"),
      ).rejects.toMatchObject({ code: "DEMAND_006" });
      expect(repo.updateStatusGate).not.toHaveBeenCalled();
      expect(eventBus.publish).not.toHaveBeenCalled();
    },
  );

  it("defaults optional programId/plannedBudget to null in the payload", async () => {
    const repo = makeDemandRepo(makeDemandDTO({ status: "Approved" }));
    const eventBus = makeEventBus();
    const svc = new PromotionService(repo as never, eventBus as never, makeAudit() as never);

    await svc.promoteToProject(
      "demand-1",
      { portfolioId: PROMOTE_CMD.portfolioId, plannedStart: "2026-08-01", plannedEnd: "2026-12-31" },
      CTX,
      "req-1",
    );

    expect(eventBus.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ programId: null, plannedBudget: null }),
      }),
    );
  });
});
