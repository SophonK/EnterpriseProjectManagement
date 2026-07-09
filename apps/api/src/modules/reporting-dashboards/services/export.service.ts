import { Injectable } from "@nestjs/common";
import { AppError, EXPORT_ROW_LIMIT } from "@epm/shared";

/**
 * Leading characters a spreadsheet application (Excel / Sheets / LibreOffice) will
 * interpret as the start of a formula. Free-text user input (RAID titles, project /
 * resource names) flows into the CSV, so a cell like `=cmd()` or `@SUM(...)` must be
 * neutralized to prevent CSV formula injection.
 */
const CSV_FORMULA_TRIGGERS = new Set(["=", "+", "-", "@", "\t", "\r"]);

/** Escape a single CSV cell value (formula-injection safe + RFC-4180 quoting). */
function escapeCsvCell(value: unknown): string {
  let s = String(value ?? "");
  // CSV formula injection: if the cell would be read as a formula, prefix a single quote
  // so the spreadsheet treats it as literal text instead of executing it.
  if (s.length > 0 && CSV_FORMULA_TRIGGERS.has(s[0]!)) {
    s = `'${s}`;
  }
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/**
 * Pure, deterministic CSV serializer.
 * Empty input → empty string. Non-empty → header line + N data lines (CRLF-less, "\n" separated).
 */
export function toCsv(rows: object[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]!);
  const lines = [
    headers.join(","),
    ...rows.map((row) =>
      headers.map((h) => escapeCsvCell((row as Record<string, unknown>)[h])).join(","),
    ),
  ];
  return lines.join("\n");
}

@Injectable()
export class ExportService {
  /**
   * Validates row count against EXPORT_ROW_LIMIT and serializes to CSV.
   * Throws REPORT_002 if too many rows.
   */
  exportToCsv(rows: object[], reportType: string): { csv: string; filename: string; rowCount: number } {
    if (rows.length > EXPORT_ROW_LIMIT) {
      throw new AppError(
        "REPORT_002",
        `Export has ${rows.length} rows which exceeds the ${EXPORT_ROW_LIMIT} row limit. Narrow your filter and try again.`,
      );
    }
    const today = new Date().toISOString().slice(0, 10);
    return {
      csv: toCsv(rows),
      filename: `${reportType}-${today}.csv`,
      rowCount: rows.length,
    };
  }
}
