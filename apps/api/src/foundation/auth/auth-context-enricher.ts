import type { JWTPayload } from "jose";
import type { AuthContext, Role, RecordScope } from "@epm/shared";

/**
 * Optional hook that lets a unit (identity-access) supply authorization data from
 * a source of record (the `identity` DB) instead of trusting IdP JWT claims.
 * When no enricher is bound, TokenVerifier keeps its claim-based behavior.
 */
export interface AuthContextEnricher {
  enrich(userId: string, claims: JWTPayload): Promise<{ roles: Role[]; recordScopes: RecordScope[] }>;
}

/** DI token for the optional enricher. */
export const AUTH_CONTEXT_ENRICHER = Symbol("AUTH_CONTEXT_ENRICHER");

/**
 * Apply an enricher to a claim-derived AuthContext. Pure + testable.
 * Identity (userId) always comes from the verified token; roles/scopes are
 * replaced by the enricher when one is bound.
 */
export async function applyEnricher(
  base: AuthContext,
  claims: JWTPayload,
  enricher?: AuthContextEnricher,
): Promise<AuthContext> {
  if (!enricher) return base;
  const { roles, recordScopes } = await enricher.enrich(base.userId, claims);
  return { ...base, roles, recordScopes };
}
