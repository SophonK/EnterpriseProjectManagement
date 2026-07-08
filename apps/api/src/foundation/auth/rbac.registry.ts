import { Injectable } from "@nestjs/common";
import type { Permission, Role } from "@epm/shared";

/**
 * Central role→permission catalog. The foundation ships it empty; each unit
 * registers its own grants at bootstrap. `permitted` is the PermissionCheck
 * consumed by the shared `canAccess` decision function.
 */
@Injectable()
export class RbacRegistry {
  private readonly grants = new Map<Role, Set<Permission>>();

  /** Grant one or more permissions to a role. */
  grant(role: Role, ...permissions: Permission[]): void {
    const set = this.grants.get(role) ?? new Set<Permission>();
    for (const p of permissions) set.add(p);
    this.grants.set(role, set);
  }

  /** PermissionCheck: does any of the roles hold the required permission? */
  readonly permitted = (roles: readonly Role[], required: Permission): boolean =>
    roles.some((role) => this.grants.get(role)?.has(required) ?? false);
}
