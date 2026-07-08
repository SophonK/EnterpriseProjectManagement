import { Injectable } from "@nestjs/common";
import {
  type AuthContext,
  type InvestmentMixGroupBy,
  type InvestmentSummary,
} from "@epm/shared";
import { ProjectAlignmentViewRepository } from "../repositories/project-alignment-view.repository.js";
import { GoalLinkRepository } from "../repositories/goal-link.repository.js";
import { StrategicGoalRepository } from "../repositories/strategic-goal.repository.js";
import { PortfolioRepository } from "../repositories/portfolio.repository.js";

/** On-demand investment-mix aggregation (no materialized store, D3-5 / US-009). */
@Injectable()
export class InvestmentMixService {
  constructor(
    private readonly viewRepo: ProjectAlignmentViewRepository,
    private readonly goalLinkRepo: GoalLinkRepository,
    private readonly goalRepo: StrategicGoalRepository,
    private readonly portfolioRepo: PortfolioRepository,
  ) {}

  /**
   * BR-108: group in-scope projection rows by `portfolio` (strict partition — each project
   * in exactly one group) or by `goal` (covering multiset — a project linked to N goals
   * contributes to N goal-groups by design, per-link expansion). `plannedBudget` is nullable;
   * a null contributes 0 to `totalPlannedBudget` and still counts toward `projectCount`.
   * Total-preserving per P1.
   */
  async getInvestmentMix(
    groupBy: InvestmentMixGroupBy,
    ctx: AuthContext,
  ): Promise<InvestmentSummary[]> {
    if (groupBy === "portfolio") {
      const groups = await this.viewRepo.aggregateByPortfolio();
      const portfolios = await this.portfolioRepo.findMany(ctx);
      const nameById = new Map(portfolios.map((p) => [p.id, p.name]));
      return groups.map((g) => ({
        groupingType: "portfolio",
        groupId: g.groupId,
        groupName: nameById.get(g.groupId) ?? g.groupId,
        projectCount: g.projectCount,
        totalPlannedBudget: g.totalPlannedBudget,
      }));
    }

    const groups = await this.viewRepo.aggregateByGoal();
    const goals = await this.goalRepo.listActive();
    const nameById = new Map(goals.map((g) => [g.id, g.title]));
    return groups.map((g) => ({
      groupingType: "goal",
      groupId: g.groupId,
      groupName: nameById.get(g.groupId) ?? g.groupId,
      projectCount: g.projectCount,
      totalPlannedBudget: g.totalPlannedBudget,
    }));
  }
}
