import type { Request } from "express";
import type { AuthContext } from "@epm/shared";

/** Header used to propagate a correlation id across services/clients. */
export const REQUEST_ID_HEADER = "x-request-id";

// Augment Express Request with our correlation id + auth context (set by middleware/guards).
declare module "express" {
  interface Request {
    requestId?: string;
    auth?: AuthContext;
  }
}

/** Read the correlation id assigned to a request (empty string if unset). */
export function getRequestId(req: Request): string {
  return req.requestId ?? "";
}

/** Read the authenticated context assigned by AuthGuard (undefined if unauthenticated). */
export function getAuth(req: Request): AuthContext | undefined {
  return req.auth;
}
