// @epm/shared — RFC 7807 problem+json shape and mapping.
import { resolveErrorCode } from "./error-codes.js";
import type { AppError } from "./app-error.js";

/** RFC 7807 problem details, extended with our `code` and `requestId`. */
export interface ProblemDetails {
  readonly type: string;
  readonly title: string;
  readonly status: number;
  readonly detail?: string;
  readonly code: string;
  readonly requestId: string;
}

/**
 * Map an AppError to a ProblemDetails using the code registry.
 * Total: never throws. Unknown codes resolve to INTERNAL (500).
 */
export function toProblemDetails(err: AppError, requestId: string): ProblemDetails {
  const def = resolveErrorCode(err.code);
  return {
    type: def.type,
    title: def.title,
    status: def.status,
    ...(err.detail !== undefined ? { detail: err.detail } : {}),
    code: err.code,
    requestId,
  };
}
