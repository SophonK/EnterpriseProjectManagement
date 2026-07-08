import { describe, it, expect, vi } from "vitest";
import "../../../../../../packages/shared/src/errors/demand-error-codes.js";
import { DemandRequestService } from "../services/demand-request.service.js";
import type { AuthContext, DemandRequestDTO } from "@epm/shared";

const CTX: AuthContext = { userId: "user-1", roles: ["PORTFOLIO_MANAGER"], recordScopes: [] };

function makeDemandDTO(overrides: Partial<DemandRequestDTO> = {}): DemandRequestDTO {
  return {
    id: "demand-1",
    title: "New CRM",
    sponsor: "VP Sales",
    description: "Replace legacy CRM",
    expectedValue: null,
    status: "Submitted",
    currentGate: "Submitted",
    rejectionReason: null,
    submittedBy: "user-1",
    submittedAt: new Date().toISOString(),
    promotedProjectId: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeDemandRepo(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    create: vi.fn().mockResolvedValue(makeDemandDTO()),
    findByIdScoped: vi.fn().mockResolvedValue(makeDemandDTO()),
    findManyScoped: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
}

function makeEventBus() {
  return { publish: vi.fn().mockResolvedValue(undefined), subscribe: vi.fn() };
}

function makeAudit() {
  return { record: vi.fn().mockResolvedValue(undefined) };
}

describe("DemandRequestService.submitIntake — BR-201 required-field validation", () => {
  it("persists with status/currentGate = Submitted, publishes demand.submitted, audits", async () => {
    const repo = makeDemandRepo();
    const eventBus = makeEventBus();
    const audit = makeAudit();
    const svc = new DemandRequestService(repo as never, eventBus as never, audit as never);

    const dto = await svc.submitIntake(
      { title: "New CRM", sponsor: "VP Sales", description: "Replace legacy CRM" },
      CTX,
      "req-1",
    );

    expect(dto.status).toBe("Submitted");
    expect(dto.currentGate).toBe("Submitted");
    // BR-202: submittedBy from AuthContext, not client-supplied
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ title: "New CRM", submittedBy: "user-1" }),
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "create", entityType: "demand-request" }),
    );
    expect(eventBus.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "demand-intake.demand.submitted",
        source: "demand-intake",
        data: expect.objectContaining({
          demandId: "demand-1",
          title: "New CRM",
          submittedBy: "user-1",
        }),
      }),
    );
  });

  it.each([
    ["title", { title: "", sponsor: "VP", description: "d" }],
    ["sponsor", { title: "t", sponsor: "  ", description: "d" }],
    ["description", { title: "t", sponsor: "VP", description: "" }],
  ])("rejects a missing/blank %s with DEMAND_001 and writes nothing", async (_field, cmd) => {
    const repo = makeDemandRepo();
    const eventBus = makeEventBus();
    const audit = makeAudit();
    const svc = new DemandRequestService(repo as never, eventBus as never, audit as never);

    await expect(svc.submitIntake(cmd as never, CTX, "req-1")).rejects.toMatchObject({
      code: "DEMAND_001",
    });
    expect(repo.create).not.toHaveBeenCalled();
    expect(eventBus.publish).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });
});
