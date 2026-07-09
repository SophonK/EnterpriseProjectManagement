import { describe, it, expect, vi } from "vitest";
import "../../../../../../packages/shared/src/errors/demand-error-codes.js";
import { StageGateService } from "../services/stage-gate.service.js";
import type { AuthContext, DemandRequestDTO, IntakeGate, DemandStatus } from "@epm/shared";

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

function makeDemandRepo(request: DemandRequestDTO, overrides: Partial<Record<string, unknown>> = {}) {
  return {
    findByIdScopedForUpdate: vi.fn().mockResolvedValue(request),
    updateStatusGate: vi
      .fn()
      .mockImplementation(
        async (
          _id: string,
          data: { status: DemandStatus; currentGate?: IntakeGate; rejectionReason?: string | null },
        ) => makeDemandDTO({ ...request, ...data }),
      ),
    ...overrides,
  };
}

function makeGateDecisionRepo() {
  return { append: vi.fn().mockResolvedValue(undefined) };
}

function makeEventBus() {
  return { publish: vi.fn().mockResolvedValue(undefined), subscribe: vi.fn() };
}

function makeAudit() {
  return { record: vi.fn().mockResolvedValue(undefined) };
}

// Sentinel transaction client; the mock $transaction hands the SAME object to the callback so
// tests can assert every repo/audit write was routed through the one interactive transaction.
const TX = { $queryRaw: vi.fn().mockResolvedValue([]) };

function makePrisma() {
  return {
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(TX)),
  };
}

const permitAll = { permitted: vi.fn().mockReturnValue(true) };

describe("StageGateService.advanceGate — BR-205 per-gate RBAC", () => {
  it("advances one legal step and records a GateDecision (Submitted → Screening)", async () => {
    const repo = makeDemandRepo(makeDemandDTO({ status: "Submitted", currentGate: "Submitted" }));
    const gates = makeGateDecisionRepo();
    const rbac = { permitted: vi.fn().mockReturnValue(true) };
    const prisma = makePrisma();
    const svc = new StageGateService(
      repo as never,
      gates as never,
      rbac as never,
      makeEventBus() as never,
      makeAudit() as never,
      prisma as never,
    );

    const dto = await svc.advanceGate("demand-1", CTX, "req-1");

    expect(rbac.permitted).toHaveBeenCalledWith(CTX.roles, "intake-gate:screening");
    // The read-for-update + decision + status change all ran inside one interactive transaction,
    // and each write was routed through the SAME tx client (TX sentinel).
    expect(prisma.$transaction).toHaveBeenCalledOnce();
    expect(repo.findByIdScopedForUpdate).toHaveBeenCalledWith("demand-1", CTX, TX);
    expect(gates.append).toHaveBeenCalledWith(
      expect.objectContaining({ fromGate: "Submitted", toGate: "Screening", decision: "Advanced" }),
      TX,
    );
    expect(repo.updateStatusGate).toHaveBeenCalledWith(
      "demand-1",
      expect.objectContaining({ status: "Screening", currentGate: "Screening" }),
      TX,
    );
    expect(dto.status).toBe("Screening");
  });

  it("denies the advance (403) with no mutation when the per-gate permission is missing", async () => {
    const repo = makeDemandRepo(makeDemandDTO({ status: "Screening", currentGate: "Screening" }));
    const gates = makeGateDecisionRepo();
    const rbac = { permitted: vi.fn().mockReturnValue(false) };
    const svc = new StageGateService(
      repo as never,
      gates as never,
      rbac as never,
      makeEventBus() as never,
      makeAudit() as never,
      makePrisma() as never,
    );

    await expect(svc.advanceGate("demand-1", CTX, "req-1")).rejects.toMatchObject({
      code: "AUTH_002",
    });
    // Fail-closed inside the transaction: the permission check throws before any write, so
    // neither the GateDecision nor the status change is persisted (the tx rolls back).
    expect(gates.append).not.toHaveBeenCalled();
    expect(repo.updateStatusGate).not.toHaveBeenCalled();
  });

  it("publishes demand.approved on the final advance (Evaluation → Approved)", async () => {
    const repo = makeDemandRepo(makeDemandDTO({ status: "Evaluation", currentGate: "Evaluation" }));
    const eventBus = makeEventBus();
    const svc = new StageGateService(
      repo as never,
      makeGateDecisionRepo() as never,
      permitAll as never,
      eventBus as never,
      makeAudit() as never,
      makePrisma() as never,
    );

    const dto = await svc.advanceGate("demand-1", CTX, "req-1");

    expect(dto.status).toBe("Approved");
    expect(eventBus.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "demand-intake.demand.approved",
        data: { demandId: "demand-1" },
      }),
    );
  });

  it("BR-206: illegal advance past Approved throws DEMAND_005 without mutating", async () => {
    const repo = makeDemandRepo(makeDemandDTO({ status: "Approved", currentGate: "Approved" }));
    const gates = makeGateDecisionRepo();
    const svc = new StageGateService(
      repo as never,
      gates as never,
      permitAll as never,
      makeEventBus() as never,
      makeAudit() as never,
      makePrisma() as never,
    );

    await expect(svc.advanceGate("demand-1", CTX, "req-1")).rejects.toMatchObject({
      code: "DEMAND_005",
    });
    expect(gates.append).not.toHaveBeenCalled();
    expect(repo.updateStatusGate).not.toHaveBeenCalled();
  });

  it("BR-206: advance from a terminal status (Rejected) throws DEMAND_005", async () => {
    const repo = makeDemandRepo(makeDemandDTO({ status: "Rejected", currentGate: "Screening" }));
    const svc = new StageGateService(
      repo as never,
      makeGateDecisionRepo() as never,
      permitAll as never,
      makeEventBus() as never,
      makeAudit() as never,
      makePrisma() as never,
    );

    await expect(svc.advanceGate("demand-1", CTX, "req-1")).rejects.toMatchObject({
      code: "DEMAND_005",
    });
  });
});

describe("StageGateService.rejectGate — BR-207 rejection is terminal with reason", () => {
  it("sets status = Rejected + reason, records a reject GateDecision, publishes demand.rejected", async () => {
    const repo = makeDemandRepo(makeDemandDTO({ status: "Screening", currentGate: "Screening" }));
    const gates = makeGateDecisionRepo();
    const eventBus = makeEventBus();
    const svc = new StageGateService(
      repo as never,
      gates as never,
      permitAll as never,
      eventBus as never,
      makeAudit() as never,
      makePrisma() as never,
    );

    const dto = await svc.rejectGate("demand-1", { reason: "no budget" }, CTX, "req-1");

    expect(dto.status).toBe("Rejected");
    expect(dto.rejectionReason).toBe("no budget");
    // The reject GateDecision was routed through the interactive transaction (TX sentinel).
    expect(gates.append).toHaveBeenCalledWith(
      expect.objectContaining({ toGate: null, decision: "Rejected", reason: "no budget" }),
      TX,
    );
    expect(eventBus.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "demand-intake.demand.rejected",
        data: { demandId: "demand-1", reason: "no budget" },
      }),
    );
  });

  it("rejects an empty reason with DEMAND_001 and writes nothing", async () => {
    const repo = makeDemandRepo(makeDemandDTO({ status: "Screening", currentGate: "Screening" }));
    const gates = makeGateDecisionRepo();
    const svc = new StageGateService(
      repo as never,
      gates as never,
      permitAll as never,
      makeEventBus() as never,
      makeAudit() as never,
      makePrisma() as never,
    );

    await expect(svc.rejectGate("demand-1", { reason: "  " }, CTX, "req-1")).rejects.toMatchObject({
      code: "DEMAND_001",
    });
    expect(gates.append).not.toHaveBeenCalled();
    expect(repo.updateStatusGate).not.toHaveBeenCalled();
  });

  it("cannot reject a terminal request (Rejected) — DEMAND_005", async () => {
    const repo = makeDemandRepo(makeDemandDTO({ status: "Rejected", currentGate: "Screening" }));
    const svc = new StageGateService(
      repo as never,
      makeGateDecisionRepo() as never,
      permitAll as never,
      makeEventBus() as never,
      makeAudit() as never,
      makePrisma() as never,
    );

    await expect(
      svc.rejectGate("demand-1", { reason: "late" }, CTX, "req-1"),
    ).rejects.toMatchObject({ code: "DEMAND_005" });
  });

  it("REL-DI-03: a mid-transaction audit failure aborts the whole advance (no event published)", async () => {
    // The decision + status change + audit share one interactive transaction. If the audit
    // write throws, $transaction rejects and NOTHING commits — critically, the post-commit
    // demand.approved event is never published (an event must not escape a rolled-back tx).
    const repo = makeDemandRepo(makeDemandDTO({ status: "Evaluation", currentGate: "Evaluation" }));
    const eventBus = makeEventBus();
    const audit = { record: vi.fn().mockRejectedValue(new Error("audit insert failed")) };
    const svc = new StageGateService(
      repo as never,
      makeGateDecisionRepo() as never,
      permitAll as never,
      eventBus as never,
      audit as never,
      makePrisma() as never,
    );

    await expect(svc.advanceGate("demand-1", CTX, "req-1")).rejects.toThrow("audit insert failed");
    expect(eventBus.publish).not.toHaveBeenCalled();
  });
});
