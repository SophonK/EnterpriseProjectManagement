import { Body, Controller, Get, HttpCode, Param, Post, Req } from "@nestjs/common";
import type { Request } from "express";
import {
  AssociateGoalsSchema,
  CreatePortfolioSchema,
  CreateProgramSchema,
  type AssociateGoalsCommand,
  type CreatePortfolioCommand,
  type CreateProgramCommand,
  type PortfolioDTO,
  type ProgramDTO,
} from "@epm/shared";
import { RequirePermission } from "../../../foundation/auth/decorators.js";
import { getAuth, getRequestId } from "../../../foundation/logging/request-context.js";
import { ZodValidationPipe } from "../../../foundation/validation/zod-validation.pipe.js";
import { PortfolioService } from "../services/portfolio.service.js";
import { ProgramService } from "../services/program.service.js";

@Controller("api/v1/strategy/portfolios")
export class PortfolioController {
  constructor(
    private readonly portfolioService: PortfolioService,
    private readonly programService: ProgramService,
  ) {}

  @Post()
  @RequirePermission("strategy-portfolio:create")
  async createPortfolio(
    @Body(new ZodValidationPipe(CreatePortfolioSchema, "STRATEGY_001"))
    body: CreatePortfolioCommand,
    @Req() req: Request,
  ): Promise<PortfolioDTO> {
    return this.portfolioService.createPortfolio(body, getAuth(req)!, getRequestId(req));
  }

  // Record-scoped: Portfolio Manager sees only own; EPMO Director sees all.
  @Get()
  @RequirePermission("strategy-portfolio:read")
  async listPortfolios(@Req() req: Request): Promise<PortfolioDTO[]> {
    return this.portfolioService.listPortfolios(getAuth(req)!);
  }

  @Get(":id")
  @RequirePermission("strategy-portfolio:read")
  async getPortfolio(@Param("id") id: string, @Req() req: Request): Promise<PortfolioDTO> {
    return this.portfolioService.getPortfolio(id, getAuth(req)!);
  }

  // Idempotent (P3) — returns 200 with the associated goal ids.
  @Post(":id/goals")
  @HttpCode(200)
  @RequirePermission("strategy-portfolio:create")
  async associateGoals(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(AssociateGoalsSchema, "STRATEGY_001"))
    body: AssociateGoalsCommand,
    @Req() req: Request,
  ): Promise<PortfolioDTO> {
    return this.portfolioService.associateGoals(id, body.goalIds, getAuth(req)!, getRequestId(req));
  }

  @Post(":id/programs")
  @RequirePermission("strategy-program:create")
  async createProgram(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(CreateProgramSchema, "STRATEGY_001"))
    body: CreateProgramCommand,
    @Req() req: Request,
  ): Promise<ProgramDTO> {
    return this.programService.createProgram(id, body, getAuth(req)!, getRequestId(req));
  }

  @Get(":id/programs")
  @RequirePermission("strategy-program:read")
  async listPrograms(@Param("id") id: string, @Req() req: Request): Promise<ProgramDTO[]> {
    return this.programService.listPrograms(id, getAuth(req)!);
  }
}
