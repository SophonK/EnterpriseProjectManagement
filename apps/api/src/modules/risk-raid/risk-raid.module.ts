import { Module } from "@nestjs/common";
import { DbModule } from "../../foundation/db/db.module.js";
import { AuditModule } from "../../foundation/audit/audit.module.js";
import { EventsModule } from "../../foundation/events/events.module.js";
import { AuthModule } from "../../foundation/auth/auth.module.js";
import { RbacRegistry } from "../../foundation/auth/rbac.registry.js";
import { ProjectExecutionModule } from "../project-execution/project-execution.module.js";
import { ProjectService } from "../project-execution/services/project.service.js";

import { RaidItemRepository } from "./repositories/raid-item.repository.js";
import { DependencyRepository } from "./repositories/dependency.repository.js";

import { RaidItemService } from "./services/raid-item.service.js";
import { DependencyService } from "./services/dependency.service.js";
import { RaidQueryService } from "./services/raid-query.service.js";

import { RiskRaidEventSub } from "./events/risk-raid-event.sub.js";

import { RaidController } from "./controllers/raid.controller.js";
import { DependencyController } from "./controllers/dependency.controller.js";

@Module({
  imports: [DbModule, AuditModule, EventsModule, AuthModule, ProjectExecutionModule],
  controllers: [RaidController, DependencyController],
  providers: [
    RaidItemRepository,
    DependencyRepository,
    RaidItemService,
    DependencyService,
    RaidQueryService,
    { provide: "PROJECT_SERVICE", useExisting: ProjectService },
    RiskRaidEventSub,
  ],
  exports: [RaidItemService, DependencyService, RaidQueryService],
})
export class RiskRaidModule {
  constructor(private readonly rbac: RbacRegistry) {
    rbac.grant("EPMO_DIRECTOR",     "raid:read", "raid:write", "dependency:read", "dependency:write");
    rbac.grant("PORTFOLIO_MANAGER", "raid:read", "raid:write", "dependency:read", "dependency:write");
    rbac.grant("PROGRAM_MANAGER",   "raid:read", "raid:write", "dependency:read", "dependency:write");
    rbac.grant("PROJECT_MANAGER",   "raid:read", "raid:write", "dependency:read");
    rbac.grant("RESOURCE_MANAGER",  "raid:read", "dependency:read");
    rbac.grant("EXECUTIVE_SPONSOR", "raid:read", "dependency:read");
  }
}
