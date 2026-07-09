import { Module } from "@nestjs/common";
import { DbModule } from "../../foundation/db/db.module.js";
import { AuditModule } from "../../foundation/audit/audit.module.js";
import { EventsModule } from "../../foundation/events/events.module.js";
import { AuthModule } from "../../foundation/auth/auth.module.js";
import { RbacRegistry } from "../../foundation/auth/rbac.registry.js";
import { ProjectExecutionModule } from "../project-execution/project-execution.module.js";

import { ResourceRepository } from "./repositories/resource.repository.js";
import { AllocationRepository } from "./repositories/allocation.repository.js";
import { CapacityPeriodRepository } from "./repositories/capacity-period.repository.js";

import { ResourceService } from "./services/resource.service.js";
import { AllocationService } from "./services/allocation.service.js";
import { UtilizationService } from "./services/utilization.service.js";
import { CapacityService } from "./services/capacity.service.js";

import { ResourceManagementEventSub } from "./events/resource-management-event.sub.js";

import { ResourceController } from "./controllers/resource.controller.js";
import { AllocationController } from "./controllers/allocation.controller.js";
import { UtilizationController } from "./controllers/utilization.controller.js";
import { CapacityController } from "./controllers/capacity.controller.js";

import { ProjectService } from "../project-execution/services/project.service.js";

@Module({
  imports: [DbModule, AuditModule, EventsModule, AuthModule, ProjectExecutionModule],
  controllers: [
    ResourceController,
    AllocationController,
    UtilizationController,
    CapacityController,
  ],
  providers: [
    ResourceRepository,
    AllocationRepository,
    CapacityPeriodRepository,
    ResourceService,
    UtilizationService,
    CapacityService,
    {
      provide: "PROJECT_SERVICE",
      useExisting: ProjectService,
    },
    AllocationService,
    ResourceManagementEventSub,
  ],
  exports: [ResourceService, AllocationService, UtilizationService, CapacityService],
})
export class ResourceManagementModule {
  constructor(private readonly rbac: RbacRegistry) {
    rbac.grant(
      "EPMO_DIRECTOR",
      "resource:read", "resource:write",
      "allocation:read", "allocation:write",
      "utilization:read", "capacity:read",
    );

    rbac.grant(
      "RESOURCE_MANAGER",
      "resource:read", "resource:write",
      "allocation:read", "allocation:write",
      "utilization:read", "capacity:read",
    );

    rbac.grant(
      "PORTFOLIO_MANAGER",
      "resource:read",
      "allocation:read",
      "utilization:read", "capacity:read",
    );

    rbac.grant(
      "PROGRAM_MANAGER",
      "resource:read",
      "allocation:read",
      "utilization:read",
    );

    rbac.grant("PROJECT_MANAGER", "resource:read", "allocation:read");

    rbac.grant(
      "EXECUTIVE_SPONSOR",
      "resource:read",
      "utilization:read", "capacity:read",
    );
  }
}
