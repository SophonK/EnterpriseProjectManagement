import { Module, type MiddlewareConsumer, type NestModule } from "@nestjs/common";
import { ConfigModule } from "./foundation/config/config.module.js";
import { LoggingModule } from "./foundation/logging/logging.module.js";
import { DbModule } from "./foundation/db/db.module.js";
import { ErrorsModule } from "./foundation/errors/errors.module.js";
import { EventsModule } from "./foundation/events/events.module.js";
import { AuthModule } from "./foundation/auth/auth.module.js";
import { AuditModule } from "./foundation/audit/audit.module.js";
import { HealthModule } from "./foundation/health/health.module.js";
import { IdentityAccessModule } from "./modules/identity-access/identity-access.module.js";
import { RequestIdMiddleware } from "./foundation/logging/request-id.middleware.js";
import { StrategyPortfolioModule } from "./modules/strategy-portfolio/strategy-portfolio.module.js";
import { ProjectExecutionModule } from "./modules/project-execution/project-execution.module.js";
import { DemandIntakeModule } from "./modules/demand-intake/demand-intake.module.js";
import { ResourceManagementModule } from "./modules/resource-management/resource-management.module.js";
import { RiskRaidModule } from "./modules/risk-raid/risk-raid.module.js";
import { ReportingDashboardsModule } from "./modules/reporting-dashboards/reporting-dashboards.module.js";

/**
 * Composition root. Foundation modules (config, logging, db, auth, events, audit,
 * health) are registered here first, then domain unit modules as they are built.
 */
@Module({
  imports: [
    ConfigModule,
    LoggingModule,
    DbModule,
    ErrorsModule,
    EventsModule,
    AuditModule,
    AuthModule,
    HealthModule,
    IdentityAccessModule,
    // strategy-portfolio is registered BEFORE project-execution because execution
    // soft-ref-validates its programId/portfolioId against this unit's in-process API.
    StrategyPortfolioModule,
    ProjectExecutionModule,
    // demand-intake publishes demand-intake.demand.* — registered AFTER project-execution,
    // whose subscriber consumes demand-intake.demand.promoted to create the Project.
    DemandIntakeModule,
    // resource-management registered AFTER project-execution (soft-FK validates projectId via ProjectService)
    ResourceManagementModule,
    // risk-raid registered AFTER project-execution (soft-FK validates projectId via ProjectService)
    RiskRaidModule,
    // reporting-dashboards last — reads from all other domain units
    ReportingDashboardsModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // Correlation id on every request, before any handler runs.
    consumer.apply(RequestIdMiddleware).forRoutes("*");
  }
}
