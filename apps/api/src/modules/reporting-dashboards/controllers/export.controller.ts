import { Controller, Get, Query, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { AppError } from "@epm/shared";
import type { ExportFilter } from "@epm/shared";
import { RequirePermission } from "../../../foundation/auth/decorators.js";
import { getAuth } from "../../../foundation/logging/request-context.js";
import { DashboardService } from "../services/dashboard.service.js";
import { ExportService } from "../services/export.service.js";

@Controller("api/v1/reports")
export class ExportController {
  constructor(
    private readonly dashboardService: DashboardService,
    private readonly exportService: ExportService,
  ) {}

  @Get("export")
  @RequirePermission("dashboard:read")
  async exportReport(
    @Query("reportType") reportType: string,
    @Query("portfolioId") portfolioId?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("projectId") projectId?: string,
    @Req() req?: Request,
    @Res() res?: Response,
  ): Promise<void> {
    if (!reportType) throw new AppError("REPORT_001", "reportType is required");

    const filter: ExportFilter = {
      reportType: reportType as ExportFilter["reportType"],
      portfolioId,
      from,
      to,
      projectId,
    };

    const ctx = getAuth(req!)!;
    const rows = await this.dashboardService.getExportRows(filter, ctx);
    const { csv, filename } = this.exportService.exportToCsv(rows, reportType);

    res!.set({
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="${filename}"`,
    });
    res!.send(csv);
  }
}
