import { describe, it, expect, vi } from "vitest";
import "../../../../../../packages/shared/src/errors/demand-error-codes.js";
import { ScoringModelService } from "../services/scoring-model.service.js";
import type { AuthContext, ScoringModelDTO } from "@epm/shared";

const CTX: AuthContext = { userId: "director-1", roles: ["EPMO_DIRECTOR"], recordScopes: [] };

function makeModelDTO(overrides: Partial<ScoringModelDTO> = {}): ScoringModelDTO {
  return {
    id: "model-2",
    name: "FY26 rubric",
    version: 2,
    isActive: true,
    createdBy: "director-1",
    criteria: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeAudit() {
  return { record: vi.fn().mockResolvedValue(undefined) };
}

// Sentinel transaction client; the mock $transaction hands the SAME object to the callback so
// tests can assert create-with-criteria + activate + audit were all folded into ONE transaction.
const TX = { $queryRaw: vi.fn().mockResolvedValue([]) };

function makePrisma() {
  return {
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(TX)),
  };
}

describe("ScoringModelService.configureScoring — BR-209 single active version", () => {
  it("creates a new version then activates it (deactivating the prior active model)", async () => {
    const created = makeModelDTO({ isActive: false });
    const activated = makeModelDTO({ isActive: true });
    const repo = {
      createWithCriteria: vi.fn().mockResolvedValue(created),
      activate: vi.fn().mockResolvedValue(activated),
    };
    const audit = makeAudit();
    const svc = new ScoringModelService(repo as never, audit as never, makePrisma() as never);

    const result = await svc.configureScoring(
      {
        name: "FY26 rubric",
        criteria: [
          { name: "Strategic fit", weight: 3, maxScore: 100, goalId: null },
          { name: "ROI", weight: 2, maxScore: 100, goalId: null },
        ],
      },
      CTX,
      "req-1",
    );

    // createdBy from AuthContext; criteria carried with monotonic sortOrder. Create, activate,
    // and audit were all folded into the ONE interactive transaction (routed through TX).
    expect(repo.createWithCriteria).toHaveBeenCalledWith(
      { name: "FY26 rubric", createdBy: "director-1" },
      [
        expect.objectContaining({ name: "Strategic fit", weight: 3, sortOrder: 0 }),
        expect.objectContaining({ name: "ROI", weight: 2, sortOrder: 1 }),
      ],
      TX,
    );
    // activation is a distinct step keyed by the newly created model id (single-active)
    expect(repo.activate).toHaveBeenCalledWith("model-2", TX);
    expect(result.isActive).toBe(true);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "create", entityType: "scoring-model" }),
      TX,
    );
  });

  it("getActiveModel surfaces DEMAND_003 when no model is active", async () => {
    const repo = {
      getActiveOrThrow: vi.fn().mockRejectedValue(
        Object.assign(new Error("No active scoring model"), { code: "DEMAND_003" }),
      ),
    };
    const svc = new ScoringModelService(repo as never, makeAudit() as never, makePrisma() as never);

    await expect(svc.getActiveModel(CTX)).rejects.toMatchObject({ code: "DEMAND_003" });
  });
});
