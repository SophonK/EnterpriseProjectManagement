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
      return {
        type: `/errors/http-${status}`,
        title: exception.name,
        status,
        detail: exception.message,
        code: `HTTP_${status}`,
        requestId,
      };
    }
    // Unknown throwable → do not leak internals.
    return toProblemDetails(AppError.internal(), requestId);
  }
}
