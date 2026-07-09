// @epm/shared — the AuthContext carried on every request after authentication.
import type { Role, RecordScope } from "./roles.js";

/**
 * Sentinel UUID used as the actor for system-initiated writes (e.g. event subscribers
 * that create records on behalf of the platform rather than a human user).
 * NIL UUID is valid syntax for every @db.Uuid column and requires no seeded row
 * when owner_user_id / created_by / actor_id have no hard FK to the users table.
 */
export const SYSTEM_ACTOR_ID = "00000000-0000-0000-0000-000000000000";

/**
 * Immutable identity + authorization context injected by the foundation auth
 * middleware. Never populated from client-supplied input.
 */
export interface AuthContext {
  readonly userId: string;
  readonly roles: readonly Role[];
  readonly recordScopes: readonly RecordScope[];
}

/** A reference to a record for scope checks. */
export interface ScopedRef {
  readonly type: RecordScope["type"];
  readonly id: string;
  /** Ancestor ids (root→parent) for subtree scope matching, if applicable. */
  readonly ancestorIds?: readonly string[];
}
