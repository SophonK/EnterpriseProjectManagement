import {
  Catch,
  HttpException,
  type ArgumentsHost,
  type ExceptionFilter,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { AppError, toProblemDetails, type ProblemDetails } from "@epm/shared";
import { getRequestId } from "../logging/request-context.js";

/**
 * Catches every unhandled exception and renders it as RFC 7807
 * `application/problem+json`. AppError maps via the shared code registry;
 * Nest HttpExceptions keep their status; anything else becomes INTERNAL (500).
 */
@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();
    const requestId = getRequestId(req);

    const problem = this.toProblem(exception, requestId);
    res.status(problem.status).type("application/problem+json").json(problem);
  }

  private toProblem(exception: unknown, requestId: string): ProblemDetails {
    if (exception instanceof AppError) {
      return toProblemDetails(exception, requestId);
    }
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      // Pipes/guards may embed a domain error code + detail in the exception body
      // (e.g. ZodValidationPipe → { code: "DEMAND_001", detail }). Surface it when
      // present; otherwise fall back to the generic HTTP_<status> code.
      const body = exception.getResponse();
      const embedded =
        typeof body === "object" && body !== null
          ? (body as { code?: unknown; detail?: unknown })
          : undefined;
      const code =
        typeof embedded?.code === "string" ? embedded.code : `HTTP_${status}`;
      const detail =
        typeof embedded?.detail === "string" ? embedded.detail : exception.message;
      return {
        type: `/errors/http-${status}`,
        title: exception.name,
        status,
        detail,
        code,
        requestId,
      };
    }
    // Unknown throwable → do not leak internals.
    return toProblemDetails(AppError.internal(), requestId);
  }
}
