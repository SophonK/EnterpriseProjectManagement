import { Controller, Get, Param, Req } from "@nestjs/common";
import type { Request } from "express";
import { AppError, type AuthContext, type RollupSummaryDTO } from "@epm/shared";
import { RequirePermission } from "../../../foundation/auth/decorators.js";
import { getAuth } from "../../../foundation/logging/request-context.js";
import { ProjectQueryService } from "../services/project-query.service.js";

@Controller("api/v1/portfolios")
export class RollupController {
  constructor(private readonly projectQueryService: ProjectQueryService) {}

  @Get(":portfolioId/rollup")
  @RequirePermission("portfolio:read")
  async getPortfolioRollup(
    @Req() req: Request,
    @Param("portfolioId") portfolioId: string,
  ): Promise<RollupSummaryDTO | null> {
    return this.projectQueryService.getPortfolioRollup(portfolioId, null, auth(req));
  }

  @Get(":portfolioId/programs/:programId/rollup")
  @RequirePermission("portfolio:read")
  async getProgramRollup(
    @Req() req: Request,
    @Param("portfolioId") portfolioId: string,
    @Param("programId") programId: string,
  ): Promise<RollupSummaryDTO | null> {
    return this.projectQueryService.getPortfolioRollup(portfolioId, programId, auth(req));
  }
}

function auth(req: Request): AuthContext {
  const ctx = getAuth(req);
  if (!ctx) throw AppError.unauthenticated();
  return ctx;
}
