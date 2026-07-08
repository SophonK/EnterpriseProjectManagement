// @epm/shared — the AuthContext carried on every request after authentication.
import type { Role, RecordScope } from "./roles.js";

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
