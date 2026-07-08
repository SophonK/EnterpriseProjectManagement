import { Module } from "@nestjs/common";
import { DbModule } from "../../foundation/db/db.module.js";
import { AuditModule } from "../../foundation/audit/audit.module.js";
import { EventsModule } from "../../foundation/events/events.module.js";
import { AuthModule } from "../../foundation/auth/auth.module.js";
import { RbacRegistry } from "../../foundation/auth/rbac.registry.js";

import { StrategicGoalRepository } from "./repositories/strategic-goal.repository.js";
import { PortfolioRepository } from "./repositories/portfolio.repository.js";
import { ProgramRepository } from "./repositories/program.repository.js";
import { GoalLinkRepository } from "./repositories/goal-link.repository.js";
import { ProjectAlignmentViewRepository } from "./repositories/project-alignment-view.repository.js";

import { StrategicGoalService } from "./services/strategic-goal.service.js";
import { PortfolioService } from "./services/portfolio.service.js";
import { ProgramService } from "./services/program.service.js";
import { GoalLinkService } from "./services/goal-link.service.js";
import { AlignmentService } from "./services/alignment.service.js";
import { InvestmentMixService } from "./services/investment-mix.service.js";

import { ProjectAlignmentProjector } from "./events/strategy-portfolio-event.sub.js";

import { StrategicGoalController } from "./controllers/strategic-goal.controller.js";
import { PortfolioController } from "./controllers/portfolio.controller.js";
import { GoalLinkController } from "./controllers/goal-link.controller.js";
import { AlignmentController } from "./controllers/alignment.controller.js";
import { InvestmentMixController } from "./controllers/investment-mix.controller.js";

@Module({
  imports: [DbModule, AuditModule, EventsModule, AuthModule],
  controllers: [
    StrategicGoalController,
    PortfolioController,
    GoalLinkController,
    AlignmentController,
    InvestmentMixController,
  ],
  providers: [
    StrategicGoalRepository,
    PortfolioRepository,
    ProgramRepository,
    GoalLinkRepository,
    ProjectAlignmentViewRepository,
    StrategicGoalService,
    PortfolioService,
    ProgramService,
    GoalLinkService,
    AlignmentService,
    InvestmentMixService,
    ProjectAlignmentProjector,
  ],
  // In-process module-API (D3-6): project-execution injects these to validate its
  // soft `programId` / `portfolioId` references without a cross-schema FK.
  exports: [ProgramService, PortfolioService],
})
export class StrategyPortfolioModule {
  constructor(private readonly rbac: RbacRegistry) {
    // EPMO Director — strategic goals, all portfolios/programs/links/mix, unaligned report.
    rbac.grant(
      "EPMO_DIRECTOR",
      "strategy-goal:create", "strategy-goal:read", "strategy-goal:archive",
      "strategy-portfolio:create", "strategy-portfolio:read",
      "strategy-program:create", "strategy-program:read",
      "goal-link:create", "goal-link:delete",
      "investment-mix:read",
      "alignment:read",
    );

    // Portfolio Manager — own portfolios/programs (record-scoped), links, investment-mix,
    // and list strategic goals; NOT goal create/archive, NOT the unaligned-work report.
    rbac.grant(
      "PORTFOLIO_MANAGER",
      "strategy-goal:read",
      "strategy-portfolio:create", "strategy-portfolio:read",
      "strategy-program:create", "strategy-program:read",
      "goal-link:create", "goal-link:delete",
      "investment-mix:read",
    );
  }
}
