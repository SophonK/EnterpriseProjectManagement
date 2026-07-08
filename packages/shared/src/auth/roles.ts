// @epm/shared — RBAC roles and permissions shared across all units.

/** The 8 platform roles (D1-10). */
export const ROLES = [
  "EPMO_DIRECTOR",
  "PORTFOLIO_MANAGER",
  "PROGRAM_MANAGER",
  "PROJECT_MANAGER",
  "RESOURCE_MANAGER",
  "EXECUTIVE_SPONSOR",
  "FINANCE_CONTROLLER",
  "TEAM_MEMBER",
] as const;

export type Role = (typeof ROLES)[number];

/**
 * Permission string: `[domain]:[action]`, e.g. "project:create", "portfolio:read".
 * Units register their own; foundation only defines the shape.
 */
export type Permission = `${string}:${string}`;

/** Record scope types map to the ownership hierarchy. */
export const SCOPE_TYPES = ["portfolio", "program", "project", "resource-pool"] as const;
export type ScopeType = (typeof SCOPE_TYPES)[number];

/**
 * A record-level scope grant. A scope covers a record if the record's id is in
 * `ids`, or (for hierarchical types) it sits under `subtreeRootId`.
 */
export interface RecordScope {
  readonly type: ScopeType;
  readonly ids?: readonly string[];
  readonly subtreeRootId?: string;
}
