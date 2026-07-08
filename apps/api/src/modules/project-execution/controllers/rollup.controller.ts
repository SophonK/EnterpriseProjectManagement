import { Controller, Get, Param, Query } from "@nestjs/common";
import type { RollupSummaryDTO } from "@epm/shared";
import { RequirePermission } from "../../../foundation/auth/decorators.js";
import { ProjectQueryService } from "../services/project-query.service.js";

@Controller("api/v1/portfolios")
export class RollupController {
  constructor(private readonly projectQueryService: ProjectQueryService) {}

  @Get(":portfolioId/rollup")
  @RequirePermission("portfolio:read")
  async getPortfolioRollup(
    @Param("portfolioId") portfolioId: string,
  ): Promise<RollupSummaryDTO | null> {
    return this.projectQueryService.getPortfolioRollup(portfolioId, null);
  }

  @Get(":portfolioId/programs/:programId/rollup")
  @RequirePermission("portfolio:read")
  async getProgramRollup(
    @Param("portfolioId") portfolioId: string,
    @Param("programId") programId: string,
  ): Promise<RollupSummaryDTO | null> {
    return this.projectQueryService.getPortfolioRollup(portfolioId, programId);
  }
}
