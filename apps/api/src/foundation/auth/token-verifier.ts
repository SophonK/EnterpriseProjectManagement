import { Injectable, Optional, Inject } from "@nestjs/common";
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import { AppError, ROLES, recordScopeSchema, type AuthContext, type RecordScope, type Role } from "@epm/shared";
import { ConfigService } from "../config/config.service.js";
import {
  AUTH_CONTEXT_ENRICHER,
  applyEnricher,
  type AuthContextEnricher,
} from "./auth-context-enricher.js";

/**
 * Verifies IdP-issued JWT access tokens against the issuer's JWKS.
 * The remote JWKS is cached (cooldown) with a bounded fetch timeout — this is the
 * JWKS cache + basic outbound protection for the IdP dependency (REL-3, SEC-1).
 */
@Injectable()
export class TokenVerifier {
  private readonly issuer: string;
  private readonly jwks: ReturnType<typeof createRemoteJWKSet>;

  constructor(
    config: ConfigService,
    @Optional() @Inject(AUTH_CONTEXT_ENRICHER) private readonly enricher?: AuthContextEnricher,
  ) {
    this.issuer = config.get("OIDC_ISSUER");
    this.jwks = createRemoteJWKSet(new URL(".well-known/jwks.json", this.issuer), {
      cooldownDuration: 30_000,
      timeoutDuration: 5_000,
    });
  }

  /**
   * Verify a token and build the AuthContext, or throw AUTH_001. Fail closed.
   * When an AuthContextEnricher is bound, roles/scopes come from the source of
   * record (DB) rather than the token claims.
   */
  async verify(token: string): Promise<AuthContext> {
    try {
      const { payload } = await jwtVerify(token, this.jwks, { issuer: this.issuer });
      const base = toAuthContext(payload);
      return applyEnricher(base, payload, this.enricher);
    } catch (err) {
      if (err instanceof AppError) throw err;
      throw AppError.unauthenticated("token verification failed");
    }
  }
}

/** Map verified JWT claims to an AuthContext. Unknown roles/scopes are dropped, not trusted. */
export function toAuthContext(payload: JWTPayload): AuthContext {
  const userId = typeof payload.sub === "string" ? payload.sub : "";
  if (!userId) throw AppError.unauthenticated("token missing subject");

  const rawRoles = Array.isArray(payload.roles) ? payload.roles : [];
  const roles = rawRoles.filter((r): r is Role =>
    (ROLES as readonly string[]).includes(r as string),
  );

  const rawScopes = Array.isArray((payload as Record<string, unknown>).scopes)
    ? ((payload as Record<string, unknown>).scopes as unknown[])
    : [];
  const recordScopes: RecordScope[] = [];
  for (const s of rawScopes) {
    const parsed = recordScopeSchema.safeParse(s);
    if (parsed.success) recordScopes.push(parsed.data);
  }

  return { userId, roles, recordScopes };
}
