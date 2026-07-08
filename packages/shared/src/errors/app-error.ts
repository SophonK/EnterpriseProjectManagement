// @epm/shared — the canonical application error thrown across all units.
import { resolveErrorCode } from "./error-codes.js";

/**
 * AppError carries a registered error code plus optional detail/cause.
 * The HTTP status/title/type are derived from the code registry — callers
 * only choose a code, keeping mapping consistent platform-wide.
 */
export class AppError extends Error {
  readonly code: string;
  readonly detail?: string;
  readonly status: number;

  constructor(code: string, detail?: string, options?: { cause?: unknown }) {
    const def = resolveErrorCode(code);
    super(detail ?? def.title, options);
    this.name = "AppError";
    this.code = code;
    this.detail = detail;
    this.status = def.status;
    // Preserve prototype chain when targeting ES2022/CommonJS interop.
    Object.setPrototypeOf(this, AppError.prototype);
  }

  static validation(detail?: string): AppError {
    return new AppError("VALIDATION_001", detail);
  }
  static unauthenticated(detail?: string): AppError {
    return new AppError("AUTH_001", detail);
  }
  static forbidden(detail?: string): AppError {
    return new AppError("AUTH_002", detail);
  }
  static notFound(detail?: string): AppError {
    return new AppError("NOT_FOUND", detail);
  }
  static conflict(detail?: string): AppError {
    return new AppError("CONFLICT_001", detail);
  }
  static internal(detail?: string, cause?: unknown): AppError {
    return new AppError("INTERNAL", detail, { cause });
  }

  /** Normalize any thrown value into an AppError (unknown → INTERNAL). */
  static from(err: unknown): AppError {
    if (err instanceof AppError) return err;
    if (err instanceof Error) return AppError.internal(undefined, err);
    return AppError.internal();
  }
}
