import { describe, it, expect, vi } from "vitest";
import fc from "fast-check";
import { Prisma } from "@prisma/client";
import { DependencyService } from "../services/dependency.service.js";

// ---------------------------------------------------------------------------
// Test doubles — a small in-memory dependency repo that models the REAL DB
// invariants the service relies on:
//   • findByPair(from,to) returns a row iff that exact directed pair exists
//   • create() throws a Prisma P2002 when the forward pair already exists
//     (the DB's uq_dependency_pair unique constraint)
// This lets the tests drive DependencyService.linkDependency end-to-end and
// exercise both the reverse-pair (RISK_003) and P2002→RISK_003 branches.
// ---------------------------------------------------------------------------

function p2002(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
    code: "P2002",
    clientVersion: "5.22.0",
    meta: { target: "uq_dependency_pair" },
  });
}

function makeRepo() {
  const pairs = new Set<string>();
  const key = (f: string, t: string): string => `${f}|${t}`;
  return {
    _pairs: pairs,
    findByPair: vi.fn(async (from: string, to: string) =>
      pairs.has(key(from, to))
        ? {
            id: `dep-${from}-${to}`,
            fromProjectId: from,
            toProjectId: to,
            description: "d",
            dependencyType: "DependsOn",
            createdBy: "u",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          }
        : null,
    ),
    create: vi.fn(
      async (data: { fromProjectId: string; toProjectId: string; dependencyType: string }) => {
        if (pairs.has(key(data.fromProjectId, data.toProjectId))) throw p2002();
        pairs.add(key(data.fromProjectId, data.toProjectId));
        return {
          id: `dep-${data.fromProjectId}-${data.toProjectId}`,
          fromProjectId: data.fromProjectId,
          toProjectId: data.toProjectId,
          description: "d",
          dependencyType: data.dependencyType,
          createdBy: "u",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
      },
    ),
    findByIdOrThrow: vi.fn(),
    delete: vi.fn(),
    findMany: vi.fn().mockResolvedValue([[], 0]),
  };
}

function makeEventBus() {
  return { publish: vi.fn().mockResolvedValue(undefined), subscribe: vi.fn() };
}
function makeAuditService() {
  return { record: vi.fn().mockResolvedValue(undefined) };
}
function makeProjectService() {
  return {
    getProject: vi.fn().mockResolvedValue({ id: "p" }),
    getProjectById: vi.fn().mockResolvedValue({ id: "p" }),
  };
}
function makePrisma() {
  return { $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({})) };
}

function makeService(repo = makeRepo()) {
  const eventBus = makeEventBus();
  const svc = new DependencyService(
    repo as never,
    eventBus as never,
    makeAuditService() as never,
    makeProjectService() as never,
    makePrisma() as never,
  );
  return { svc, repo, eventBus };
}

const CTX = { userId: "u1", roles: ["PORTFOLIO_MANAGER"] as const, recordScopes: [] };
const cmd = (from: string, to: string) => ({
  fromProjectId: from,
  toProjectId: to,
  description: "link",
});

describe("DependencyService.linkDependency", () => {
  it("self-loop is rejected with RISK_001", async () => {
    const { svc, repo } = makeService();
    await expect(svc.linkDependency(cmd("A", "A"), CTX, "r1")).rejects.toMatchObject({
      code: "RISK_001",
    });
    expect(repo.create).not.toHaveBeenCalled();
  });

  it("direct reverse-pair is rejected with RISK_003 (before any write)", async () => {
    const repo = makeRepo();
    repo._pairs.add("B|A"); // B→A already exists
    const { svc } = makeService(repo);
    await expect(svc.linkDependency(cmd("A", "B"), CTX, "r1")).rejects.toMatchObject({
      code: "RISK_003",
    });
    expect(repo.create).not.toHaveBeenCalled();
  });

  it("duplicate forward pair surfaces the P2002 unique violation as RISK_003", async () => {
    const { svc, repo, eventBus } = makeService();
    // first link succeeds
    await svc.linkDependency(cmd("A", "B"), CTX, "r1");
    expect(repo.create).toHaveBeenCalledTimes(1);
    expect(eventBus.publish).toHaveBeenCalledTimes(1);
    // second identical link hits the DB unique constraint (P2002) → RISK_003
    await expect(svc.linkDependency(cmd("A", "B"), CTX, "r2")).rejects.toMatchObject({
      code: "RISK_003",
    });
    // no second event published for the rejected create
    expect(eventBus.publish).toHaveBeenCalledTimes(1);
  });

  it("a genuine (non-duplicate) link succeeds, audits, and publishes dependency.linked", async () => {
    const { svc, eventBus } = makeService();
    const dep = await svc.linkDependency(cmd("A", "B"), CTX, "r1");
    expect(dep.fromProjectId).toBe("A");
    expect(dep.toProjectId).toBe("B");
    const [evt] = eventBus.publish.mock.calls[0] as [{ eventType: string }];
    expect(evt.eventType).toBe("risk-raid.dependency.linked");
  });

  it("a non-P2002 create error is NOT swallowed as RISK_003", async () => {
    const repo = makeRepo();
    repo.create = vi.fn().mockRejectedValue(new Error("connection reset"));
    const { svc } = makeService(repo);
    await expect(svc.linkDependency(cmd("A", "B"), CTX, "r1")).rejects.toThrow("connection reset");
  });
});

// ---------------------------------------------------------------------------
// PBT P4 — circular / duplicate detection driven through the REAL linkDependency
// ---------------------------------------------------------------------------

describe("PBT P4 — dependency invariants via real linkDependency", () => {
  it("reverse pair is always rejected (RISK_003); a fresh pair always succeeds", async () => {
    await fc.assert(
      fc.asyncProperty(fc.uuid(), fc.uuid(), async (a, b) => {
        if (a === b) return true; // self-loop handled by a separate assertion
        const { svc } = makeService();
        // fresh A→B succeeds
        const dep = await svc.linkDependency(cmd(a, b), CTX, "r1");
        if (dep.fromProjectId !== a || dep.toProjectId !== b) return false;
        // now B→A must be rejected as circular
        let rejected = false;
        try {
          await svc.linkDependency(cmd(b, a), CTX, "r2");
        } catch (e) {
          rejected = (e as { code?: string }).code === "RISK_003";
        }
        return rejected;
      }),
      { numRuns: 50 },
    );
  });

  it("re-linking the same directed pair is always rejected via the P2002 path", async () => {
    await fc.assert(
      fc.asyncProperty(fc.uuid(), fc.uuid(), async (a, b) => {
        if (a === b) return true;
        const { svc } = makeService();
        await svc.linkDependency(cmd(a, b), CTX, "r1");
        let rejected = false;
        try {
          await svc.linkDependency(cmd(a, b), CTX, "r2");
        } catch (e) {
          rejected = (e as { code?: string }).code === "RISK_003";
        }
        return rejected;
      }),
      { numRuns: 50 },
    );
  });
});
