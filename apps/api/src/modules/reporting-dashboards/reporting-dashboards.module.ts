import { Module } from "@nestjs/common";
import { DbModule } from "../../foundation/db/db.module.js";
import { AuthModule } from "../../foundation/auth/auth.module.js";
import { RbacRegistry } from "../../foundation/auth/rbac.registry.js";
import { ProjectExecutionModule } from "../project-execution/project-execution.module.js";
import { ResourceManagementModule } from "../resource-management/resource-management.module.js";
import { RiskRaidModule } from "../risk-raid/risk-raid.module.js";

import { DashboardService } from "./services/dashboard.service.js";
import { ExportService } from "./services/export.service.js";
import { DashboardController } from "./controllers/dashboard.controller.js";
import { ExportController } from "./controllers/export.controller.js";

@Module({
  imports: [
    DbModule,
    AuthModule,
    // Provides ProjectQueryService (rollup + at-risk projects) and ProjectService
    // (scoped listProjects → resolves the viewed portfolio's accessible project ids, H6)
    ProjectExecutionModule,
    // Provides UtilizationService (capacity heatmap)
    ResourceManagementModule,
    // Provides RaidItemService (risk summary list) and RaidQueryService
    // (record-scoped getRaidSummary → portfolio-scoped top escalated risks, H6)
    RiskRaidModule,
  ],
  controllers: [DashboardController, ExportController],
  providers: [DashboardService, ExportService],
})
export class ReportingDashboardsModule {
  constructor(private readonly rbac: RbacRegistry) {
    rbac.grant("EPMO_DIRECTOR",     "dashboard:read");
    rbac.grant("PORTFOLIO_MANAGER", "dashboard:read");
    rbac.grant("PROGRAM_MANAGER",   "dashboard:read");
    rbac.grant("PROJECT_MANAGER",   "dashboard:read");
    rbac.grant("RESOURCE_MANAGER",  "dashboard:read");
    rbac.grant("EXECUTIVE_SPONSOR", "dashboard:read");
  }
}
