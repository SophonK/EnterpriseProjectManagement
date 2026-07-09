import { Injectable } from "@nestjs/common";
import { AppError, EXPORT_ROW_LIMIT } from "@epm/shared";

/** Escape a single CSV cell value. */
function escapeCsvCell(value: unknown): string {
  const s = String(value ?? "");
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
