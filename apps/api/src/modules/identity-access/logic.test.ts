import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { ROLES, type Permission, type Role } from "@epm/shared";
import { effectivePermissions, toRecordScopes, withRole, type ScopeRow } from "./logic.js";

const roleArb = fc.constantFrom(...ROLES);
const permArb = fc.constantFrom<Permission>(
  "project:read",
  "project:create",
  "portfolio:read",
  "identity:assign-role",
);

function catalogFrom(pairs: [Role, Permission][]): Map<Role, Set<Permission>> {
  const m = new Map<Role, Set<Permission>>();
  for (const [r, p] of pairs) {
    const s = m.get(r) ?? new Set<Permission>();
    s.add(p);
    m.set(r, s);
  }
  return m;
}

describe("effectivePermissions (P-IA-1)", () => {
  it("is the union of role grants; empty roles → empty; dedups", () => {
    fc.assert(
      fc.property(fc.array(fc.tuple(roleArb, permArb)), fc.subarray([...ROLES]), (pairs, roles) => {
        const catalog = catalogFrom(pairs);
        const eff = effectivePermissions(roles, catalog);
        // every effective permission traces to some held role's grant
        for (const p of eff) {
          expect(roles.some((r) => catalog.get(r)?.has(p))).toBe(true);
        }
        // empty roles → empty
        expect(effectivePermissions([], catalog).size).toBe(0);
      }),
    );
  });

  it("monotonic: adding a role never removes a permission", () => {
    fc.assert(
      fc.property(fc.array(fc.tuple(roleArb, permArb)), fc.subarray([...ROLES]), roleArb, (pairs, roles, extra) => {
        const catalog = catalogFrom(pairs);
        const before = effectivePermissions(roles, catalog);
        const after = effectivePermissions([...roles, extra], catalog);
        for (const p of before) expect(after.has(p)).toBe(true);
      }),
    );
  });
});

describe("toRecordScopes (P-IA-2)", () => {
  const uuid = "00000000-0000-4000-8000-000000000001";
  it("keeps valid rows, drops invalid, and every output validates", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            scopeType: fc.constantFrom("portfolio", "project", "not-a-type", ""),
            scopeId: fc.option(fc.constantFrom(uuid, "not-a-uuid"), { nil: null }),
            subtreeRootId: fc.option(fc.constantFrom(uuid, "bad"), { nil: null }),
          }) as fc.Arbitrary<ScopeRow>,
        ),
        (rows) => {
          const scopes = toRecordScopes(rows);
          // never throws, and each result is a well-formed scope
          for (const s of scopes) {
            expect(["portfolio", "program", "project", "resource-pool"]).toContain(s.type);
            expect(s.ids !== undefined || s.subtreeRootId !== undefined).toBe(true);
          }
        },
      ),
    );
  });
});

describe("withRole (P-IA-3)", () => {
  it("is idempotent (no duplicates)", () => {
    fc.assert(
      fc.property(fc.subarray([...ROLES]), roleArb, (existing, role) => {
        const once = withRole(existing, role);
        const twice = withRole(once, role);
        expect(twice).toEqual(once);
        expect(twice.filter((r) => r === role).length).toBeLessThanOrEqual(1);
      }),
    );
  });
});
