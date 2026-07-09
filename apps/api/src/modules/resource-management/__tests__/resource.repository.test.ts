import { describe, it, expect } from "vitest";
import type { AuthContext } from "@epm/shared";
import { buildResourceScopeWhere } from "../repositories/resource.repository.js";

// ---------------------------------------------------------------------------
// C1 — buildResourceScopeWhere: pool scoping must fail closed.
//
// These run as NON-Director roles. Before the C1 fix the helper filtered the wrong
// scope type/field and returned `{}` (match-everything) for an empty scope — a
// cross-tenant leak. Each assertion below would FAIL against that old behavior.
// ---------------------------------------------------------------------------

function ctx(roles: AuthContext["roles"], recordScopes: AuthContext["recordScopes"]): AuthContext {
  return { userId: "user-1", roles, recordScopes };
}

describe("buildResourceScopeWhere", () => {
  it("RESOURCE_MANAGER with a resource-pool scope ⇒ { poolId: { in: [...] } }", () => {
    const where = buildResourceScopeWhere(
      ctx(["RESOURCE_MANAGER"], [{ type: "resource-pool", ids: ["poolA"] }]),
    );
    expect(where).toEqual({ poolId: { in: ["poolA"] } });
  });

  it("subtreeRootId on a resource-pool scope is included", () => {
    const where = buildResourceScopeWhere(
      ctx(["RESOURCE_MANAGER"], [{ type: "resource-pool", subtreeRootId: "poolRoot" }]),
    );
    expect(where).toEqual({ poolId: { in: ["poolRoot"] } });
  });

  it("RESOURCE_MANAGER with NO resource-pool scope ⇒ fail closed { poolId: { in: [] } }, NOT {}", () => {
    const where = buildResourceScopeWhere(ctx(["RESOURCE_MANAGER"], []));
    expect(where).toEqual({ poolId: { in: [] } });
    expect(where).not.toEqual({});
  });

  it("a non-pool scope type does NOT widen access (still fail-closed)", () => {
    const where = buildResourceScopeWhere(
      ctx(["RESOURCE_MANAGER"], [{ type: "portfolio", ids: ["pf-1"] }]),
    );
    expect(where).toEqual({ poolId: { in: [] } });
  });

  it("EPMO_DIRECTOR ⇒ unrestricted {}", () => {
    const where = buildResourceScopeWhere(ctx(["EPMO_DIRECTOR"], []));
    expect(where).toEqual({});
  });
});
