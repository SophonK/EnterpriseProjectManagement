import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { NotFoundException, type ArgumentsHost } from "@nestjs/common";
import { AppError, SHARED_ERROR_CODES, resolveErrorCode } from "@epm/shared";
import { ProblemDetailsFilter } from "./problem-details.filter.js";

interface CapturedResponse {
  status: number;
  contentType: string;
  body: Record<string, unknown>;
}

function runFilter(exception: unknown, requestId = "req-123"): CapturedResponse {
  const captured: Partial<CapturedResponse> = {};
  const res = {
    status(s: number) {
      captured.status = s;
      return this;
    },
    type(t: string) {
      captured.contentType = t;
      return this;
    },
    json(b: Record<string, unknown>) {
      captured.body = b;
      return this;
    },
  };
  const host = {
    switchToHttp: () => ({
      getResponse: () => res,
      getRequest: () => ({ requestId }),
    }),
  } as unknown as ArgumentsHost;

  new ProblemDetailsFilter().catch(exception, host);
  return captured as CapturedResponse;
}

const codes = Object.keys(SHARED_ERROR_CODES);

describe("ProblemDetailsFilter (PBT — property P2)", () => {
  it("maps any AppError to problem+json with the registry status + code + requestId", () => {
    fc.assert(
      fc.property(fc.constantFrom(...codes), fc.uuid(), (code, rid) => {
        const out = runFilter(new AppError(code), rid);
        expect(out.contentType).toBe("application/problem+json");
        expect(out.status).toBe(resolveErrorCode(code).status);
        expect(out.body.code).toBe(code);
        expect(out.body.requestId).toBe(rid);
      }),
    );
  });

  it("preserves the status of a Nest HttpException", () => {
    const out = runFilter(new NotFoundException("nope"));
    expect(out.status).toBe(404);
    expect(out.body.code).toBe("HTTP_404");
  });

  it("maps unknown throwables to INTERNAL 500 without leaking details", () => {
    const out = runFilter(new Error("secret stack detail"));
    expect(out.status).toBe(500);
    expect(out.body.code).toBe("INTERNAL");
    expect(JSON.stringify(out.body)).not.toContain("secret stack detail");
  });
});
