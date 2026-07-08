import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { SCOPE_TYPES, type RecordScope, type Role } from "./roles.js";
import type { AuthContext, ScopedRef } from "./auth-context.js";
import { canAccess, canAccessRecord, buildScopedRef } from "./access.js";
import type { AuthContext as Ctx } from "./auth-context.js";

const nonDirectorRoles: Role[] = [
  "PORTFOLIO_MANAGER",
  "PROGRAM_MANAGER",
  "PROJECT_MANAGER",
  "RESOURCE_MANAGER",
  "TEAM_MEMBER",
];

const idArb = fc.constantFrom("a", "b", "c", "d", "e", "root-1", "root-2");
const typeArb = fc.constantFrom(...SCOPE_TYPES);

const scopeArb: fc.Arbitrary<RecordScope> = fc.record(
  {
    type: typeArb,
    ids: fc.option(fc.array(idArb, { maxLength: 4 }), { nil: undefined }),
    subtreeRootId: fc.option(idArb, { nil: undefined }),
  },
  { requiredKeys: ["type"] },
);

const recordArb: fc.Arbitrary<ScopedRef> = fc.record(
  {
    type: typeArb,
    id: idArb,
    ancestorIds: fc.option(fc.array(idArb, { maxLength: 3 }), { nil: undefined }),
  },
  { requiredKeys: ["type", "id"] },
);

const ctxArb: fc.Arbitrary<AuthContext> = fc.record({
  userId: fc.uuid(),
  roles: fc.subarray(nonDirectorRoles),
  recordScopes: fc.array(scopeArb, { maxLength: 5 }),
});

describe("RBAC record-scope evaluation (PBT — property P3)", () => {
  it("deny-by-default: a non-director with no scopes can access no record", () => {
    fc.assert(
      fc.property(fc.subarray(nonDirectorRoles), recordArb, (roles, record) => {
        const ctx: AuthContext = { userId: "u", roles, recordScopes: [] };
        expect(canAccessRecord(ctx, record)).toBe(false);
      }),
    );
  });

  it("EPMO Director can access any record", () => {
    fc.assert(
      fc.property(recordArb, (record) => {
        const ctx: AuthContext = { userId: "u", roles: ["EPMO_DIRECTOR"], recordScopes: [] };
        expect(canAccessRecord(ctx, record)).toBe(true);
      }),
    );
  });

  it("monotonic: adding a scope never removes access", () => {
    fc.assert(
      fc.property(ctxArb, recordArb, scopeArb, (ctx, record, extra) => {
        const before = canAccessRecord(ctx, record);
        const after = canAccessRecord(
          { ...ctx, recordScopes: [...ctx.recordScopes, extra] },
          record,
        );
        if (before) expect(after).toBe(true);
      }),
    );
  });

  it("never throws on arbitrary (possibly malformed) inputs", () => {
    fc.assert(
      fc.property(ctxArb, recordArb, (ctx, record) => {
        expect(() => canAccessRecord(ctx, record)).not.toThrow();
      }),
    );
  });

  it("canAccess gates on permission first (deny when permission denied)", () => {
    fc.assert(
      fc.property(ctxArb, recordArb, (ctx, record) => {
        // Permission always denied => access denied regardless of scopes.
        expect(canAccess(ctx, "project:read", record, () => false)).toBe(false);
      }),
    );
  });
});

describe("buildScopedRef (SR-MJ-1 subtree contract)", () => {
  it("drops empty/self ancestor ids and keeps order", () => {
    const ref = buildScopedRef("project", "proj-1", ["port-1", null, undefined, "", "proj-1", "prog-1"]);
    expect(ref).toEqual({ type: "project", id: "proj-1", ancestorIds: ["port-1", "prog-1"] });
  });

  it("lets a portfolio-subtree grant authorize a project beneath it", () => {
    // Non-director user granted the whole portfolio subtree.
    const ctx: Ctx = {
      userId: "u",
      roles: ["PORTFOLIO_MANAGER"],
      recordScopes: [{ type: "project", subtreeRootId: "port-1" }],
    };
    // A project under port-1 → access granted BECAUSE ancestorIds includes port-1.
    const withAncestors = buildScopedRef("project", "proj-9", ["port-1", "prog-2"]);
    expect(canAccessRecord(ctx, withAncestors)).toBe(true);

    // Same project WITHOUT ancestors → subtree grant cannot match (the bug SR-MJ-1 prevents).
    const withoutAncestors = buildScopedRef("project", "proj-9");
    expect(canAccessRecord(ctx, withoutAncestors)).toBe(false);
  });
});
