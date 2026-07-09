import { Controller, Get, Query, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { AppError } from "@epm/shared";
import type { ExportFilter, Permission } from "@epm/shared";
import { RequirePermission } from "../../../foundation/auth/decorators.js";
import { RbacRegistry } from "../../../foundation/auth/rbac.registry.js";
import { getAuth } from "../../../foundation/logging/request-context.js";
import { DashboardService } from "../services/dashboard.service.js";
import { ExportService } from "../services/export.service.js";

// H4: the export endpoint serves datasets that each have their own gate on their direct
// endpoint; enforce the SAME per-dataset permission here so `?reportType=` cannot bypass it.
const EXPORT_DATASET_PERMISSION: Record<string, Permission> = {
  "portfolio-health": "dashboard:read",
  capacity: "utilization:read",
  "risk-summary": "raid:read",
};

@Controller("api/v1/reports")
export class ExportController {
  constructor(
    private readonly dashboardService: DashboardService,
    private readonly exportService: ExportService,
    private readonly rbac: RbacRegistry,
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

    const ctxEarly = getAuth(req!)!;
    const datasetPermission = EXPORT_DATASET_PERMISSION[reportType];
    if (!datasetPermission) {
      throw new AppError("REPORT_003", `Unknown report type: ${reportType}`);
    }
    if (!this.rbac.permitted(ctxEarly.roles, datasetPermission)) {
      throw AppError.forbidden(`missing ${datasetPermission} for ${reportType} export`);
    }

    const filter: ExportFilter = {
      reportType: reportType as ExportFilter["reportType"],
      portfolioId,
      from,
      to,
      projectId,
    };

    const rows = await this.dashboardService.getExportRows(filter, ctxEarly);
    const { csv, filename } = this.exportService.exportToCsv(rows, reportType);

    res!.set({
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="${filename}"`,
    });
    res!.send(csv);
  }
}
