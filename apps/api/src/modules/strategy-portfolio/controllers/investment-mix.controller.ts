import { Controller, Get, Query, Req } from "@nestjs/common";
import type { Request } from "express";
import {
  ViewInvestmentMixSchema,
  type InvestmentSummary,
  type ViewInvestmentMixQuery,
} from "@epm/shared";
import { RequirePermission } from "../../../foundation/auth/decorators.js";
import { getAuth } from "../../../foundation/logging/request-context.js";
import { ZodValidationPipe } from "../../../foundation/validation/zod-validation.pipe.js";
import { InvestmentMixService } from "../services/investment-mix.service.js";

@Controller("api/v1/strategy/investment-mix")
export class InvestmentMixController {
  constructor(private readonly investmentMixService: InvestmentMixService) {}

  // groupBy is required (goal|portfolio); invalid/missing → STRATEGY_001.
  @Get()
  @RequirePermission("investment-mix:read")
  async getInvestmentMix(
    @Query(new ZodValidationPipe(ViewInvestmentMixSchema, "STRATEGY_001"))
    query: ViewInvestmentMixQuery,
    @Req() req: Request,
  ): Promise<InvestmentSummary[]> {
    return this.investmentMixService.getInvestmentMix(query.groupBy, getAuth(req)!);
  }
}
