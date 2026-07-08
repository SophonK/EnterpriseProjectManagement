// @epm/shared — shared error-code registry.
// Convention: [DOMAIN]_[NUMBER]. Each code maps to exactly one HTTP status + title + RFC 7807 type.
// Foundation ships the cross-cutting codes; units register their own [DOMAIN]_[NNN] via `registerErrorCodes`.

export interface ErrorCodeDef {
  /** HTTP status this code maps to. */
  readonly status: number;
  /** Human-readable, stable title (RFC 7807 `title`). */
  readonly title: string;
  /** RFC 7807 `type` URI reference (relative is fine for internal APIs). */
  readonly type: string;
}

/** Cross-cutting codes owned by the foundation. */
export const SHARED_ERROR_CODES = {
  VALIDATION_001: { status: 400, title: "Request validation failed", type: "/errors/validation" },
  AUTH_001: { status: 401, title: "Unauthenticated", type: "/errors/unauthenticated" },
  AUTH_002: { status: 403, title: "Forbidden", type: "/errors/forbidden" },
  NOT_FOUND: { status: 404, title: "Resource not found", type: "/errors/not-found" },
  CONFLICT_001: { status: 409, title: "State conflict", type: "/errors/conflict" },
  INTERNAL: { status: 500, title: "Internal server error", type: "/errors/internal" },
} as const satisfies Record<string, ErrorCodeDef>;

export type SharedErrorCode = keyof typeof SHARED_ERROR_CODES;

// Mutable registry seeded with the shared codes; units add their own at bootstrap.
const registry = new Map<string, ErrorCodeDef>(
  Object.entries(SHARED_ERROR_CODES) as [string, ErrorCodeDef][],
);

/** Register domain-specific error codes (e.g., ALLOC_001). Throws on duplicate. */
export function registerErrorCodes(codes: Record<string, ErrorCodeDef>): void {
  for (const [code, def] of Object.entries(codes)) {
    if (registry.has(code)) {
      throw new Error(`Duplicate error code registration: ${code}`);
    }
    registry.set(code, def);
  }
}

/** Look up a code's definition; falls back to INTERNAL for unknown codes (never throws). */
export function resolveErrorCode(code: string): ErrorCodeDef {
  return registry.get(code) ?? SHARED_ERROR_CODES.INTERNAL;
}

/** True if a code is registered. */
export function isRegisteredErrorCode(code: string): boolean {
  return registry.has(code);
}
