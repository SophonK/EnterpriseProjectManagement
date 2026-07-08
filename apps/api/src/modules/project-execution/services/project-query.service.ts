import { Injectable } from "@nestjs/common";
import {
  AppError,
  buildScopedRef,
  canAccessRecord,
  type AuthContext,
  type ProjectDTO,
  type RollupSummaryDTO,
} from "@epm/shared";
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
    programId: string | null,
    ctx: AuthContext,
  ): Promise<RollupSummaryDTO | null> {
    // Record-scope the aggregate read: NOT_FOUND (not FORBIDDEN) so a portfolio's
    // existence isn't revealed to callers outside its scope. Director passes.
    if (!canAccessRecord(ctx, buildScopedRef("portfolio", portfolioId))) {
      throw AppError.notFound(`portfolio ${portfolioId}`);
    }
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
