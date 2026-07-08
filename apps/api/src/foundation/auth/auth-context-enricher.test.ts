import { describe, it, expect } from "vitest";
import type { AuthContext } from "@epm/shared";
import { applyEnricher, type AuthContextEnricher } from "./auth-context-enricher.js";

const base: AuthContext = {
  userId: "user-1",
  roles: ["TEAM_MEMBER"], // claim-derived fallback
  recordScopes: [],
};

describe("applyEnricher", () => {
  it("returns the base context unchanged when no enricher is bound (backward compatible)", async () => {
    const result = await applyEnricher(base, { sub: "user-1" });
    expect(result).toEqual(base);
  });

  it("replaces roles/scopes from the enricher while preserving identity", async () => {
    const enricher: AuthContextEnricher = {
      async enrich(userId) {
        expect(userId).toBe("user-1");
        return {
          roles: ["EPMO_DIRECTOR"],
          recordScopes: [{ type: "portfolio", subtreeRootId: "p-1" }],
        };
      },
    };
    const result = await applyEnricher(base, { sub: "user-1" }, enricher);
    expect(result.userId).toBe("user-1");
    expect(result.roles).toEqual(["EPMO_DIRECTOR"]);
    expect(result.recordScopes).toEqual([{ type: "portfolio", subtreeRootId: "p-1" }]);
  });
});
