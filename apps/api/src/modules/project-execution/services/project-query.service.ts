import { Injectable } from "@nestjs/common";
import type { AuthContext, ProjectDTO, RollupSummaryDTO } from "@epm/shared";
import { ProjectRepository } from "../repositories/project.repository.js";
import { RollupService } from "./rollup.service.js";

/** Read-side in-process API consumed by resource-management, risk-raid, and reporting. */
@Injectable()
export class ProjectQueryService {
  constructor(
    private readonly projectRepo: ProjectRepository,
    private readonly rollupService: RollupService,
  ) {}

  async getPortfolioRollup(
    portfolioId: string,
    programId: string | null = null,
  ): Promise<RollupSummaryDTO | null> {
    return this.rollupService.getRollup(portfolioId, programId);
  }

  async getAtRiskProjects(portfolioId: string, ctx: AuthContext): Promise<ProjectDTO[]> {
    const { data } = await this.projectRepo.findMany(
      { portfolioId, health: "AtRisk" },
      ctx,
    );
    const offTrack = await this.projectRepo.findMany(
      { portfolioId, health: "OffTrack" },
      ctx,
    );
    return [...data, ...offTrack.data];
  }
}
