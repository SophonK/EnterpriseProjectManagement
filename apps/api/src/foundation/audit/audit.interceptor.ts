import {
  Inject,
  Injectable,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from "@nestjs/common";
import type { Request } from "express";
import { catchError, throwError, type Observable } from "rxjs";
import { AppError } from "@epm/shared";
import { getAuth, getRequestId } from "../logging/request-context.js";
import { LOGGER, type AppLogger } from "../logging/logger.js";
import { AuditService } from "./audit.service.js";

/**
 * Records access-denied events that surface from handlers (defense-in-depth; the
 * AuthGuard records guard-level denials). State-change auditing is done explicitly
 * by unit services via AuditService.record within their transaction.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private readonly audit: AuditService,
    @Inject(LOGGER) private readonly logger: AppLogger,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<Request>();
    return next.handle().pipe(
      catchError((err: unknown) => {
        if (err instanceof AppError && err.code === "AUTH_002") {
          void this.recordDenied(req);
        }
        return throwError(() => err);
      }),
    );
  }

  private async recordDenied(req: Request): Promise<void> {
    try {
      await this.audit.record({
        actorId: getAuth(req)?.userId,
        action: "access_denied",
        entityType: req.path,
        requestId: getRequestId(req),
      });
    } catch (err) {
      this.logger.error({ err }, "failed to record access-denied audit");
    }
  }
}
