import { Injectable, type CanActivate, type ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import { AppError, canAccess, type AuthContext, type Permission } from "@epm/shared";
import { PERMISSION_KEY, PUBLIC_KEY } from "./decorators.js";
import { TokenVerifier } from "./token-verifier.js";
import { RbacRegistry } from "./rbac.registry.js";
import { AuditService } from "../audit/audit.service.js";
import { getRequestId } from "../logging/request-context.js";

/**
 * Global guard: authenticates (JWT) and authorizes (RBAC) every request.
 * Deny-by-default — a non-public route with no declared permission is treated as a
 * misconfiguration and rejected (SEC-2 / BR4), so no route is accidentally open.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly verifier: TokenVerifier,
    private readonly rbac: RbacRegistry,
    private readonly audit: AuditService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, targets) ?? false;
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<Request>();
    const token = extractToken(req);
    if (!token) throw AppError.unauthenticated();

    const auth = await this.verifier.verify(token);
    req.auth = auth;

    const required = this.reflector.getAllAndOverride<Permission | undefined>(
      PERMISSION_KEY,
      targets,
    );
    if (!required) {
      // Protected route without a declared permission => refuse (fail closed).
      await this.recordDenied(req, auth);
      throw AppError.forbidden("route is missing a permission declaration");
    }

    if (!canAccess(auth, required, undefined, this.rbac.permitted)) {
      await this.recordDenied(req, auth);
      throw AppError.forbidden();
    }
    return true;
  }

  private async recordDenied(req: Request, auth: AuthContext): Promise<void> {
    // Audit is best-effort here: a failing audit write must not turn a 403 into a 500.
    try {
      await this.audit.record({
        actorId: auth.userId,
        action: "access_denied",
        entityType: req.path,
        requestId: getRequestId(req),
      });
    } catch {
      // swallow — the AuditInterceptor logs audit failures; the guard must still 403.
    }
  }
}

/**
 * Extract the access token from the Authorization header, falling back to the
 * httpOnly `epm_access` cookie set by the OIDC callback (browser SPA path).
 */
function extractToken(req: Request): string | undefined {
  const header = req.header("authorization");
  if (header) {
    const [scheme, value] = header.split(" ");
    if (scheme?.toLowerCase() === "bearer" && value) return value;
  }
  const cookieToken = req.cookies?.epm_access as string | undefined;
  return cookieToken && cookieToken.length > 0 ? cookieToken : undefined;
}
