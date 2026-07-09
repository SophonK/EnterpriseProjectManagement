import { Inject, Injectable } from "@nestjs/common";
import { RISK_BAND, riskBand } from "@epm/shared";
import type {
  AuthContext,
  RaidItemDTO,
  RaidSummaryDTO,
  RiskBand,
} from "@epm/shared";
import { RaidItemRepository } from "../repositories/raid-item.repository.js";
import type { ProjectService } from "../../project-execution/services/project.service.js";
import { resolveAccessibleProjectIds } from "./project-scope.js";

const TOP_ESCALATED_LIMIT = 5;

/**
 * H7 — read-side query API consumed by reporting-dashboards (integration.md:30-38).
 * Every method is record-scoped through the unit's shared accessible-project
 * resolution, so a non-Director only ever sees risks for projects in their scope.
 * `RaidItemService` remains the write/CRUD surface; this service is read-only.
 */
@Injectable()
export class RaidQueryService {
  constructor(
    private readonly raidItemRepo: RaidItemRepository,
    @Inject("PROJECT_SERVICE") private readonly projectService: ProjectService,
  ) {}

  /** All currently-escalated risks the caller may see, ordered by riskScore desc. */
  async listEscalatedRisks(ctx: AuthContext): Promise<RaidItemDTO[]> {
    const accessibleProjectIds = await resolveAccessibleProjectIds(this.projectService, ctx);
    return this.raidItemRepo.findEscalated(accessibleProjectIds);
  }

  /**
   * Aggregate RAID summary for a caller-supplied project-id set (e.g. a portfolio's
   * projects). The requested ids are intersected with the caller's accessible set so a
   * non-Director can never widen the summary beyond their scope; an empty effective set
   * yields an all-zero summary (fail-closed).
   */
  async getRaidSummary(projectIds: string[], ctx: AuthContext): Promise<RaidSummaryDTO> {
    const accessibleProjectIds = await resolveAccessibleProjectIds(this.projectService, ctx);
    const effectiveIds =
      accessibleProjectIds === null
        ? projectIds
        : projectIds.filter((id) => accessibleProjectIds.includes(id));

    const { totalOpen, totalEscalated, riskScores, topEscalated } =
      await this.raidItemRepo.getSummaryData(effectiveIds, TOP_ESCALATED_LIMIT);

    const byCriticality = RISK_BAND.reduce(
      (acc, band) => {
        acc[band] = 0;
        return acc;
      },
      {} as Record<RiskBand, number>,
    );
    for (const score of riskScores) {
      byCriticality[riskBand(score)] += 1;
    }

    return { totalOpen, totalEscalated, byCriticality, topEscalated };
  }
}
