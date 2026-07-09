import { Injectable } from "@nestjs/common";
import { AppError } from "@epm/shared";
import type {
  AuthContext,
  PortfolioHealthDashboardDTO,
  AlignmentCoverageDTO,
  UtilizationDTO,
  UtilizationFilter,
  RaidListDTO,
  RaidFilter,
  ExportFilter,
} from "@epm/shared";
import { PrismaService } from "../../../foundation/db/prisma.service.js";
import { ProjectQueryService } from "../../project-execution/services/project-query.service.js";
import { UtilizationService } from "../../resource-management/services/utilization.service.js";
import { RaidItemService } from "../../risk-raid/services/raid-item.service.js";

@Injectable()
export class DashboardService {
  constructor(
    private readonly projectQueryService: ProjectQueryService,
    private readonly utilizationService: UtilizationService,
    private readonly raidItemService: RaidItemService,
    private readonly prisma: PrismaService,
  ) {}

  async getPortfolioHealth(portfolioId: string, ctx: AuthContext): Promise<PortfolioHealthDashboardDTO> {
    const [rollup, atRiskProjects, escalatedPage, alignment] = await Promise.all([
      this.projectQueryService.getPortfolioRollup(portfolioId, null, ctx),
      this.projectQueryService.getAtRiskProjects(portfolioId, ctx),
      this.raidItemService.listRaidItems({ escalated: true, page: 1, pageSize: 5 }, ctx),
      this.getAlignmentCoverage(portfolioId),
    ]);

    return {
      portfolioId,
      rollup: rollup ?? {
        portfolioId,
        programId: null,
        onTrackCount: 0,
        atRiskCount: 0,
        offTrackCount: 0,
        totalCount: 0,
        computedAt: new Date().toISOString(),
      },
      alignment,
      topEscalatedRisks: escalatedPage.data,
      atRiskProjects,
    };
  }

  async getCapacityHeatmap(filter: UtilizationFilter, ctx: AuthContext): Promise<UtilizationDTO> {
    return this.utilizationService.getUtilization(filter, ctx);
  }

  async getRiskSummary(filter: RaidFilter, ctx: AuthContext): Promise<RaidListDTO> {
    return this.raidItemService.listRaidItems(filter, ctx);
  }

  async getExportRows(filter: ExportFilter, ctx: AuthContext): Promise<object[]> {
    switch (filter.reportType) {
      case "portfolio-health": {
        if (!filter.portfolioId) throw new AppError("REPORT_001", "portfolioId is required for portfolio-health export");
        const dashboard = await this.getPortfolioHealth(filter.portfolioId, ctx);
        return dashboard.atRiskProjects.map((p) => ({
          id: p.id,
          name: p.name,
          status: p.status,
          health: p.health,
          portfolioId: p.portfolioId ?? "",
          programId: p.programId ?? "",
        }));
      }
      case "capacity": {
        if (!filter.from || !filter.to) throw new AppError("REPORT_001", "from and to are required for capacity export");
        const heatmap = await this.getCapacityHeatmap({ from: filter.from, to: filter.to }, ctx);
        return heatmap.rows.flatMap((row) =>
          row.periods.map((p) => ({
            resourceId: row.resourceId,
            resourceName: row.resourceName,
            poolId: row.poolId,
            month: p.month,
            allocatedPct: p.allocatedPct,
            band: p.band,
          })),
        );
      }
      case "risk-summary": {
        const summary = await this.getRiskSummary(
          { projectId: filter.projectId, page: 1, pageSize: 1000 },
          ctx,
        );
        return summary.data.map((r) => ({
          id: r.id,
          projectId: r.projectId,
          type: r.type,
          title: r.title,
          severity: r.severity ?? "",
          probability: r.probability ?? "",
          riskScore: r.riskScore ?? "",
          status: r.status,
          escalated: r.escalated,
          ownerUserId: r.ownerUserId ?? "",
        }));
      }
      default:
        throw new AppError("REPORT_003", `Unknown report type: ${String(filter.reportType)}`);
    }
  }

  private async getAlignmentCoverage(portfolioId: string): Promise<AlignmentCoverageDTO> {
    const [activeCount, alignedCount] = await this.prisma.$transaction([
      this.prisma.projectAlignmentView.count({
        where: { portfolioId, status: { not: "Cancelled" } },
      }),
      this.prisma.projectAlignmentView.count({
        where: { portfolioId, aligned: true, status: { not: "Cancelled" } },
      }),
    ]);
    return {
      activeCount,
      alignedCount,
      coveragePct: activeCount > 0 ? Math.round((alignedCount / activeCount) * 100) : 0,
    };
  }

}
