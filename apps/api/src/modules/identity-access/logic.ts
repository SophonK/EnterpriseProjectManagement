// identity-access — pure authorization logic (property-tested: P-IA-1/2/3).
import { recordScopeSchema, type Permission, type RecordScope, type Role } from "@epm/shared";

/** P-IA-1: effective permissions = union of each held role's grants. */
export function effectivePermissions(
  roles: readonly Role[],
  catalog: ReadonlyMap<Role, ReadonlySet<Permission>>,
): Set<Permission> {
  const out = new Set<Permission>();
  for (const role of roles) {
    for (const perm of catalog.get(role) ?? []) out.add(perm);
  }
  return out;
}

export interface ScopeRow {
  scopeType: string;
  scopeId: string | null;
  subtreeRootId: string | null;
}

/**
 * P-IA-2: map user_scope rows to valid RecordScope[]. Rows failing the shared
 * `recordScopeSchema` are dropped (fail-closed) — never coerced.
 */
export function toRecordScopes(rows: readonly ScopeRow[]): RecordScope[] {
  const out: RecordScope[] = [];
  for (const row of rows) {
    const candidate = {
      type: row.scopeType,
      ...(row.scopeId ? { ids: [row.scopeId] } : {}),
      ...(row.subtreeRootId ? { subtreeRootId: row.subtreeRootId } : {}),
    };
    const parsed = recordScopeSchema.safeParse(candidate);
    if (parsed.success) out.push(parsed.data);
  }
  return out;
}

/** P-IA-3: role assignment has set semantics — no duplicates, order-insensitive. */
export function withRole(existing: readonly Role[], toAdd: Role): Role[] {
  return existing.includes(toAdd) ? [...existing] : [...existing, toAdd];
}
