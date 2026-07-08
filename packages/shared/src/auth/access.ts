// @epm/shared — pure RBAC + record-scope decision logic (property P3).
import type { AuthContext, ScopedRef } from "./auth-context.js";
import type { Permission, RecordScope, Role, ScopeType } from "./roles.js";

export const EPMO_DIRECTOR: Role = "EPMO_DIRECTOR";

/**
 * Build a ScopedRef for a record, INCLUDING its hierarchy ancestors so that
 * subtree scope grants resolve correctly (solutions-review SR-MJ-1).
 *
 * **Contract**: any hierarchical resource (project under program/portfolio, etc.)
 * MUST be checked with its `ancestorIds` populated (root→parent). Use this helper
 * so a Director's portfolio-subtree grant authorizes projects beneath it.
 *
 * @example
 * canAccess(ctx, "project:read",
 *   buildScopedRef("project", project.id, [project.portfolioId, project.programId]),
 *   rbac.permitted);
 */
export function buildScopedRef(
  type: ScopeType,
  id: string,
  ancestorIds: ReadonlyArray<string | null | undefined> = [],
): ScopedRef {
  return {
    type,
    id,
    ancestorIds: ancestorIds.filter((a): a is string => typeof a === "string" && a.length > 0 && a !== id),
  };
}

/** True if a scope grant covers the given record (direct id or subtree ancestor). */
export function scopeCovers(scope: RecordScope, record: ScopedRef): boolean {
  if (scope.type !== record.type) return false;
  if (scope.ids && scope.ids.includes(record.id)) return true;
  if (scope.subtreeRootId) {
    if (record.id === scope.subtreeRootId) return true;
    if (record.ancestorIds && record.ancestorIds.includes(scope.subtreeRootId)) return true;
  }
  return false;
}

export function isDirector(ctx: AuthContext): boolean {
  return ctx.roles.includes(EPMO_DIRECTOR);
}

/**
 * Record-level access: EPMO Director sees everything (enterprise-wide); otherwise
 * at least one held scope must cover the record. Deny-by-default. Never throws.
 */
export function canAccessRecord(ctx: AuthContext, record: ScopedRef): boolean {
  if (isDirector(ctx)) return true;
  return ctx.recordScopes.some((scope) => scopeCovers(scope, record));
}

/** Predicate resolving whether any of the roles is granted a permission. */
export type PermissionCheck = (roles: readonly Role[], required: Permission) => boolean;

/**
 * Full access decision: the permission gate must pass first (deny-by-default),
 * then, if a record is in play, record-level scope must allow it.
 */
export function canAccess(
  ctx: AuthContext,
  required: Permission,
  record: ScopedRef | undefined,
  permitted: PermissionCheck,
): boolean {
  if (!permitted(ctx.roles, required)) return false;
  if (!record) return true;
  return canAccessRecord(ctx, record);
}
