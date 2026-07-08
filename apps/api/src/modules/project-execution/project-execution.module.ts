import { Module } from "@nestjs/common";
import { DbModule } from "../../foundation/db/db.module.js";
import { AuditModule } from "../../foundation/audit/audit.module.js";
import { EventsModule } from "../../foundation/events/events.module.js";
import { AuthModule } from "../../foundation/auth/auth.module.js";
import { RbacRegistry } from "../../foundation/auth/rbac.registry.js";

import { ProjectRepository } from "./repositories/project.repository.js";
import { MilestoneRepository } from "./repositories/milestone.repository.js";
import { StatusUpdateRepository } from "./repositories/status-update.repository.js";
import { RollupSnapshotRepository } from "./repositories/rollup-snapshot.repository.js";

import { ProjectService } from "./services/project.service.js";
import { MilestoneService } from "./services/milestone.service.js";
import { RollupService } from "./services/rollup.service.js";
import { ProjectQueryService } from "./services/project-query.service.js";

import { ProjectExecutionEventSub } from "./events/project-execution-event.sub.js";

import { ProjectController } from "./controllers/project.controller.js";
import { MilestoneController } from "./controllers/milestone.controller.js";
import { StatusController } from "./controllers/status.controller.js";
import { RollupController } from "./controllers/rollup.controller.js";

@Module({
  imports: [DbModule, AuditModule, EventsModule, AuthModule],
  controllers: [
    ProjectController,
    MilestoneController,
    StatusController,
    RollupController,
  ],
  providers: [
    ProjectRepository,
    MilestoneRepository,
    StatusUpdateRepository,
    RollupSnapshotRepository,
    ProjectService,
    MilestoneService,
    RollupService,
    ProjectQueryService,
    ProjectExecutionEventSub,
  ],
  exports: [ProjectService, ProjectQueryService],
})
export class ProjectExecutionModule {
  constructor(private readonly rbac: RbacRegistry) {
    // EPMO Director — full access
    rbac.grant(
      "EPMO_DIRECTOR",
      "project:create", "project:read", "project:update", "project:delete",
      "project:update-status",
      "milestone:create", "milestone:read", "milestone:update", "milestone:delete",
      "portfolio:read",
    );

    // Portfolio Manager — read + update projects, read rollup
    rbac.grant(
      "PORTFOLIO_MANAGER",
      "project:read", "project:update", "project:update-status",
      "milestone:read",
      "portfolio:read",
    );

    // Program Manager — same as Portfolio Manager within their program
    rbac.grant(
      "PROGRAM_MANAGER",
      "project:read", "project:update", "project:update-status",
      "milestone:read",
      "portfolio:read",
    );

    // Project Manager — full project + milestone ownership
    rbac.grant(
      "PROJECT_MANAGER",
      "project:create", "project:read", "project:update", "project:delete",
      "project:update-status",
      "milestone:create", "milestone:read", "milestone:update", "milestone:delete",
    );

    // Executive Sponsor — read only
    rbac.grant("EXECUTIVE_SPONSOR", "project:read", "milestone:read", "portfolio:read");

    // Team Member — read only
    rbac.grant("TEAM_MEMBER", "project:read", "milestone:read");
  }
}
