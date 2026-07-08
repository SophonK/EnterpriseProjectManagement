import type { PrismaService } from "./prisma.service.js";

/** The bounded-context schemas. A repository declares the one it owns. */
export type UnitSchema =
  | "identity"
  | "strategy"
  | "execution"
  | "resource"
  | "risk"
  | "intake"
  | "reporting"
  | "shared";

/**
 * Base class for all unit repositories.
 *
 * Ownership rule (BR1): a repository may read/write ONLY its own `schema`. Prisma
 * cannot enforce this at the type level across a shared client, so it is a reviewed
 * convention — repositories expose typed methods over their own models and never
 * reach into another unit's tables. The `reporting` schema is the only reader
 * permitted to query across schemas (read-only projections).
 */
export abstract class BaseRepository {
  /** The schema this repository owns. Subclasses set it. */
  abstract readonly schema: UnitSchema;

  protected constructor(protected readonly prisma: PrismaService) {}
}

/**
 * Guard helper for cross-schema access attempts. Call in code paths that must stay
 * within a unit's schema; throws in non-production to surface violations early.
 */
export function assertOwnedSchema(owned: UnitSchema, target: UnitSchema): void {
  if (owned === target) return;
  if (owned === "reporting") return; // reporting may read across schemas
  const message = `cross-schema access from "${owned}" to "${target}" is forbidden (BR1)`;
  if (process.env.NODE_ENV !== "production") {
    throw new Error(message);
  }
  // In production, do not crash the request path — log-and-continue is handled by callers.
  console.error(`[db] ${message}`);
}
