import { Injectable, Logger } from "@nestjs/common";
import { AppError, buildScopedRef, canAccessRecord, EXPORT_ROW_LIMIT } from "@epm/shared";
import type {
  AuthContext,
  PortfolioHealthDashboardDTO,
  AlignmentCoverageDTO,
  UtilizationDTO,
  UtilizationFilter,
  RaidListDTO,
  RaidItemDTO,
  RaidFilter,
  ExportFilter,
  ProjectStatus,
} from "@epm/shared";
import { PrismaService } from "../../../foundation/db/prisma.service.js";
import { ProjectQueryService } from "../../project-execution/services/project-query.service.js";
import { ProjectService } from "../../project-execution/services/project.service.js";
import { UtilizationService } from "../../resource-management/services/utilization.service.js";
import { RaidItemService } from "../../risk-raid/services/raid-item.service.js";
import { RaidQueryService } from "../../risk-raid/services/raid-query.service.js";

/**
 * Terminal project status excluded from alignment coverage. This is
 * project-execution's `ProjectStatus` value "Cancelled" (see PROJECT_STATUS in
 * @epm/shared) — a cancelled project is no longer active work, so it neither counts
 * toward the active total nor the aligned total. Named to avoid a bare magic literal
 * and to make the coupling to the execution status vocabulary explicit.
 */
const CANCELLED_PROJECT_STATUS: ProjectStatus = "Cancelled";

/**
 * Page size that project-execution's `ProjectService.listProjects` and the RAID list
 * repository both hard-cap at (100). We loop pages at this size rather than requesting a
 * larger page that the repo would silently truncate.
 */
const SCOPED_PAGE_SIZE = 100;

@Injectable()
export class DashboardService {
  private readonly logger = new Logger(DashboardService.name);

  constructor(
    private readonly projectQueryService: ProjectQueryService,
    private readonly projectService: ProjectService,
    private readonly utilizationService: UtilizationService,
    private readonly raidItemService: RaidItemService,
    private readonly raidQueryService: RaidQueryService,
    private readonly prisma: PrismaService,
  ) {}

  async getPortfolioHealth(portfolioId: string, ctx: AuthContext): Promise<PortfolioHealthDashboardDTO> {
    // H6 — resolve the record-scoped project ids belonging to THIS portfolio first, so
    // the escalated-risk card is scoped to the viewed portfolio (never platform-wide).
    const projectIds = await this.resolvePortfolioProjectIds(portfolioId, ctx);

    const [rollup, atRiskProjects, raidSummary, alignment] = await Promise.all([
      this.projectQueryService.getPortfolioRollup(portfolioId, null, ctx),
      this.projectQueryService.getAtRiskProjects(portfolioId, ctx),
      // RaidQueryService.getRaidSummary intersects these ids with the caller's accessible
      // set and returns topEscalated capped at 5 — exactly the portfolio-health card need.
      this.raidQueryService.getRaidSummary(projectIds, ctx),
      this.getAlignmentCoverage(portfolioId, ctx),
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
      topEscalatedRisks: raidSummary.topEscalated,
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
        // H5 — fetch ALL in-scope risk rows (looping the record-scoped paginated call)
        // instead of a single pageSize:1000 request that the repo silently caps at 100.
        const rows = await this.fetchAllRiskRows(filter.projectId, ctx);
        return rows.map((r) => ({
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
        // correctness.md test #7 — unknown reportType is rejected with REPORT_003.
        throw new AppError("REPORT_003", `Unknown report type: ${String(filter.reportType)}`);
    }
  }

  /**
   * H6 — resolve the record-scoped project ids belonging to the viewed portfolio.
   * Delegates to project-execution's scoped `ProjectService.listProjects({ portfolioId })`,
   * looping pages (it caps pageSize at 100) so every accessible project is included.
   * Because the underlying call is record-scoped, a non-Director only ever sees projects
   * within their scope, so the resulting ids keep the escalated-risk summary scoped to
   * THIS portfolio (a missed page can only narrow, never widen, the id set — fail-closed).
   */
  private async resolvePortfolioProjectIds(portfolioId: string, ctx: AuthContext): Promise<string[]> {
    const ids: string[] = [];
    for (let page = 1; ; page++) {
      const result = await this.projectService.listProjects(
        { portfolioId, page, pageSize: SCOPED_PAGE_SIZE },
        ctx,
      );
      for (const p of result.data) ids.push(p.id);
      if (page * SCOPED_PAGE_SIZE >= result.total || result.data.length === 0) break;
    }
    return ids;
  }

  /**
   * H5 — fetch every in-scope risk row for an export by looping the record-scoped
   * paginated list. The RAID list repository hard-caps pageSize at 100, so a single
   * pageSize:1000 request was silently truncating the CSV. We stop once we have collected
   * `total` rows.
   *
   * Safety cap: we never fetch beyond `EXPORT_ROW_LIMIT + 1` rows. That one extra row lets
   * the downstream ExportService raise REPORT_002 ("too many rows") — the export fails
   * loudly rather than silently dropping data. The cap is logged when hit.
   */
  private async fetchAllRiskRows(projectId: string | undefined, ctx: AuthContext): Promise<RaidItemDTO[]> {
    const rows: RaidItemDTO[] = [];
    const hardCap = EXPORT_ROW_LIMIT + 1;
    for (let page = 1; ; page++) {
      const result = await this.getRiskSummary({ projectId, page, pageSize: SCOPED_PAGE_SIZE }, ctx);
      rows.push(...result.data);
      if (rows.length >= result.total || result.data.length === 0) break;
      if (rows.length >= hardCap) {
        this.logger.warn(
          `risk-summary export reached the ${hardCap}-row safety cap (total=${result.total}); ` +
            "ExportService will reject this with REPORT_002 rather than truncate the CSV.",
        );
        break;
      }
    }
    return rows;
  }

  private async getAlignmentCoverage(portfolioId: string, ctx: AuthContext): Promise<AlignmentCoverageDTO> {
    // Defense-in-depth: guard explicitly so the alignment count can NEVER run for an
    // out-of-scope portfolio, independent of caller ordering or a sibling Promise.all
    // throwing. A cancelled project is excluded from both the active and aligned counts.
    if (!canAccessRecord(ctx, buildScopedRef("portfolio", portfolioId))) {
      throw AppError.forbidden(`portfolio ${portfolioId} is outside your scope`);
    }
    const [activeCount, alignedCount] = await this.prisma.$transaction([
      this.prisma.projectAlignmentView.count({
        where: { portfolioId, status: { not: CANCELLED_PROJECT_STATUS } },
      }),
      this.prisma.projectAlignmentView.count({
        where: { portfolioId, aligned: true, status: { not: CANCELLED_PROJECT_STATUS } },
      }),
    ]);
    return {
      activeCount,
      alignedCount,
      coveragePct: activeCount > 0 ? Math.round((alignedCount / activeCount) * 100) : 0,
    };
  }

}
