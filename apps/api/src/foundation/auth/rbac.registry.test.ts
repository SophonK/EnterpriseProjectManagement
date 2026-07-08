import { describe, it, expect } from "vitest";
import { RbacRegistry } from "./rbac.registry.js";

describe("RbacRegistry", () => {
  it("permits a role only for granted permissions", () => {
    const rbac = new RbacRegistry();
    rbac.grant("PROJECT_MANAGER", "project:create", "project:read");

    expect(rbac.permitted(["PROJECT_MANAGER"], "project:create")).toBe(true);
    expect(rbac.permitted(["PROJECT_MANAGER"], "project:read")).toBe(true);
    expect(rbac.permitted(["PROJECT_MANAGER"], "project:delete")).toBe(false);
  });

  it("denies by default for roles with no grants", () => {
    const rbac = new RbacRegistry();
    expect(rbac.permitted(["TEAM_MEMBER"], "project:read")).toBe(false);
    expect(rbac.permitted([], "project:read")).toBe(false);
  });

  it("permits if ANY held role grants the permission", () => {
    const rbac = new RbacRegistry();
    rbac.grant("PORTFOLIO_MANAGER", "portfolio:read");
    expect(rbac.permitted(["TEAM_MEMBER", "PORTFOLIO_MANAGER"], "portfolio:read")).toBe(true);
  });

  it("accumulates grants across calls without dropping earlier ones", () => {
    const rbac = new RbacRegistry();
    rbac.grant("RESOURCE_MANAGER", "resource:read");
    rbac.grant("RESOURCE_MANAGER", "resource:allocate");
    expect(rbac.permitted(["RESOURCE_MANAGER"], "resource:read")).toBe(true);
    expect(rbac.permitted(["RESOURCE_MANAGER"], "resource:allocate")).toBe(true);
  });
});
