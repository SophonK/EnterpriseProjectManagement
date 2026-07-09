import { Inject, Injectable, Optional } from "@nestjs/common";
import { PROJECT_EXECUTION_EVENTS } from "@epm/shared";
import type { ProjectCreatedPayload, ProjectArchivedPayload, DomainEvent } from "@epm/shared";
import { EVENT_BUS, type EventBus } from "../../../foundation/events/event-bus.js";
import { PrismaService } from "../../../foundation/db/prisma.service.js";
import {
  makeIdempotent,
  PrismaIdempotencyLedger,
  type IdempotencyLedger,
} from "../../../foundation/events/idempotency.js";

export const RESOURCE_IDEMPOTENCY_LEDGER = Symbol("RESOURCE_IDEMPOTENCY_LEDGER");

@Injectable()
export class ResourceManagementEventSub {
  private readonly ledger: IdempotencyLedger;

  constructor(
    @Inject(EVENT_BUS) private readonly eventBus: EventBus,
    private readonly prisma: PrismaService,
    @Optional() @Inject(RESOURCE_IDEMPOTENCY_LEDGER) ledger?: IdempotencyLedger,
  ) {
    this.ledger = ledger ?? new PrismaIdempotencyLedger(prisma);
    this.register();
  }

  private register(): void {
    // project.created — no-op; idempotent no-op ensures the event is acknowledged
    this.eventBus.subscribe(
      PROJECT_EXECUTION_EVENTS.PROJECT_CREATED,
      makeIdempotent(
        "resource-management.on-project-created",
        this.ledger,
        async (_event: DomainEvent<ProjectCreatedPayload>) => {
          // No domain action needed — resource-management does not cache project data.
          // Idempotency ensures replay safety.
        },
      ),
    );

    // project.archived — mark allocations for the project so they are excluded from active utilization
    this.eventBus.subscribe(
      PROJECT_EXECUTION_EVENTS.PROJECT_ARCHIVED,
      makeIdempotent(
        "resource-management.on-project-archived",
        this.ledger,
        async (event: DomainEvent<ProjectArchivedPayload>) => {
          await this.prisma.allocation.updateMany({
            where: { projectId: event.data.projectId },
            data: { overAllocatedConfirmed: false, updatedAt: new Date() },
          });
        },
      ),
    );
  }
}
