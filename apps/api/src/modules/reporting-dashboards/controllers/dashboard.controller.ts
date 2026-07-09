import { Controller, Get, Query, Req } from "@nestjs/common";
import type { Request } from "express";
import type { PortfolioHealthDashboardDTO, UtilizationDTO, RaidListDTO, RaidType, RaidStatus } from "@epm/shared";
import { RequirePermission } from "../../../foundation/auth/decorators.js";
import { getAuth } from "../../../foundation/logging/request-context.js";
import { DashboardService } from "../services/dashboard.service.js";

// Permission-doc note (Low): nfr.md's security row summarises all handlers as
// `@RequirePermission("dashboard:read")`, but api-spec.md gates each dataset on its own
// permission (capacity → utilization:read, risk-summary → raid:read). The api-spec is
// authoritative and the per-endpoint decorators below (and the export.controller H4 gate)
// implement it; the nfr.md wording is a stale over-simplification, not a behavior change.
@Controller("api/v1/dashboards")
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get("portfolio-health")
  @RequirePermission("dashboard:read")
  async getPortfolioHealth(
    @Query("portfolioId") portfolioId: string,
    @Req() req: Request,
  ): Promise<PortfolioHealthDashboardDTO> {
    return this.dashboardService.getPortfolioHealth(portfolioId, getAuth(req)!);
  }

  @Get("capacity-heatmap")
  @RequirePermission("utilization:read")
  async getCapacityHeatmap(
    @Query("from") from: string,
    @Query("to") to: string,
    @Query("poolId") poolId?: string,
    @Req() req?: Request,
  ): Promise<UtilizationDTO> {
    return this.dashboardService.getCapacityHeatmap({ from, to, poolId }, getAuth(req!)!);
  }

  @Get("risk-summary")
  @RequirePermission("raid:read")
  async getRiskSummary(
    @Query("projectId") projectId?: string,
    @Query("type") type?: string,
    @Query("status") status?: string,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
    @Req() req?: Request,
  ): Promise<RaidListDTO> {
    return this.dashboardService.getRiskSummary(
      {
        projectId,
        type: type as RaidType | undefined,
        status: status as RaidStatus | undefined,
        page: page ? Number(page) : undefined,
        pageSize: pageSize ? Number(pageSize) : undefined,
      },
      getAuth(req!)!,
    );
  }
}
