import { describe, it, expect } from "vitest";
import * as fc from "fast-check";

// Side-effect: register REPORT_* error codes
import "../../../../../../packages/shared/src/errors/report-error-codes.js";

import { toCsv, ExportService } from "../services/export.service.js";
import { EXPORT_ROW_LIMIT } from "../../../../../../packages/shared/src/types/reporting-dashboards.js";

// ---------------------------------------------------------------------------
// PBT
// ---------------------------------------------------------------------------

describe("toCsv — PBT", () => {
  // P1: row count — output has exactly rows.length + 1 lines (header + data)
  it("P1: non-empty input produces header + exactly N data lines", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({ id: fc.string(), name: fc.string(), value: fc.integer() }),
          { minLength: 1, maxLength: 50 },
        ),
        (rows) => {
          const csv = toCsv(rows);
          const lines = csv.split("\n");
          expect(lines.length).toBe(rows.length + 1); // header + N rows
        },
      ),
    );
  });

  // P2: determinism — same input always produces identical output
  it("P2: toCsv is deterministic", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({ a: fc.string(), b: fc.nat() }),
          { minLength: 0, maxLength: 30 },
        ),
        (rows) => {
          expect(toCsv(rows)).toBe(toCsv(rows));
        },
      ),
    );
  });

  // P3: column count — every data line has the same number of commas as the header (modulo quoted fields)
  it("P3: data line field count matches header field count", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            id: fc.uuidV(4),
            label: fc.string({ maxLength: 20 }).filter((s) => !s.includes(",") && !s.includes('"') && !s.includes("\n")),
            count: fc.nat(999),
          }),
          { minLength: 1, maxLength: 20 },
        ),
        (rows) => {
          const csv = toCsv(rows);
          const [header, ...dataLines] = csv.split("\n");
          const headerCols = header!.split(",").length;
          for (const line of dataLines) {
            expect(line.split(",").length).toBe(headerCols);
          }
        },
      ),
    );
  });
});

// ---------------------------------------------------------------------------
// Deterministic unit assertions
// ---------------------------------------------------------------------------

describe("toCsv — deterministic", () => {
  it("empty array returns empty string", () => {
    expect(toCsv([])).toBe("");
  });

  it("single row produces header + one data line", () => {
    const csv = toCsv([{ id: "1", name: "alpha" }]);
    expect(csv).toBe("id,name\n1,alpha");
  });

  it("escapes commas in cell values", () => {
    const csv = toCsv([{ name: "foo,bar", val: "ok" }]);
    expect(csv).toBe('name,val\n"foo,bar",ok');
  });

  it("escapes double-quotes in cell values", () => {
    const csv = toCsv([{ x: 'say "hello"' }]);
    expect(csv).toBe('x\n"say ""hello"""');
  });

  it("escapes newlines in cell values", () => {
    const csv = toCsv([{ note: "line1\nline2" }]);
    expect(csv).toContain('"line1\nline2"');
  });
});

describe("ExportService — deterministic", () => {
  const svc = new ExportService();

  it("row count exactly at limit (1000) succeeds", () => {
    const rows = Array.from({ length: EXPORT_ROW_LIMIT }, (_, i) => ({ id: String(i) }));
    const result = svc.exportToCsv(rows, "risk-summary");
    expect(result.rowCount).toBe(EXPORT_ROW_LIMIT);
  });

  it("row count exceeding limit (1001) throws REPORT_002", () => {
    const rows = Array.from({ length: EXPORT_ROW_LIMIT + 1 }, (_, i) => ({ id: String(i) }));
    expect(() => svc.exportToCsv(rows, "risk-summary")).toThrowError(
      expect.objectContaining({ code: "REPORT_002" }),
    );
  });
});
