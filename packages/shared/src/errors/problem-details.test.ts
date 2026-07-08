import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { SHARED_ERROR_CODES, resolveErrorCode } from "./error-codes.js";
import { toProblemDetails } from "./problem-details.js";
import { AppError } from "./app-error.js";

const knownCodes = Object.keys(SHARED_ERROR_CODES);

describe("Error mapping (PBT groundwork — property P2)", () => {
  it("every registered code maps to its registry status and never throws", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...knownCodes),
        fc.option(fc.string(), { nil: undefined }),
        fc.uuid(),
        (code, detail, requestId) => {
          const pd = toProblemDetails(new AppError(code, detail), requestId);
          expect(pd.code).toBe(code);
          expect(pd.status).toBe(resolveErrorCode(code).status);
          expect(pd.requestId).toBe(requestId);
        },
      ),
    );
  });

  it("unknown codes resolve to INTERNAL (500), still total", () => {
    fc.assert(
      fc.property(fc.string(), fc.uuid(), (code, requestId) => {
        fc.pre(!knownCodes.includes(code));
        const pd = toProblemDetails(new AppError(code), requestId);
        expect(pd.status).toBe(500);
      }),
    );
  });
});
