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
import { RaidItemRepository } from "../repositories/raid-item.repository.js";

export const RISK_RAID_IDEMPOTENCY_LEDGER = Symbol("RISK_RAID_IDEMPOTENCY_LEDGER");

@Injectable()
export class RiskRaidEventSub {
  private readonly ledger: IdempotencyLedger;

  constructor(
    @Inject(EVENT_BUS) private readonly eventBus: EventBus,
    private readonly prisma: PrismaService,
    private readonly raidItemRepo: RaidItemRepository,
    @Optional() @Inject(RISK_RAID_IDEMPOTENCY_LEDGER) ledger?: IdempotencyLedger,
  ) {
    this.ledger = ledger ?? new PrismaIdempotencyLedger(prisma);
    this.register();
  }

  private register(): void {
    // project.created — no-op; risk-raid does not cache project data
    this.eventBus.subscribe(
      PROJECT_EXECUTION_EVENTS.PROJECT_CREATED,
      makeIdempotent(
        "risk-raid.on-project-created",
        this.ledger,
        async (_event: DomainEvent<ProjectCreatedPayload>) => {
          // No domain action needed.
        },
      ),
    );

    // project.archived — close all open/in-progress RAID items for the project
    this.eventBus.subscribe(
      PROJECT_EXECUTION_EVENTS.PROJECT_ARCHIVED,
      makeIdempotent(
        "risk-raid.on-project-archived",
        this.ledger,
        async (event: DomainEvent<ProjectArchivedPayload>) => {
          const count = await this.raidItemRepo.closeAllForProject(
            event.data.projectId,
            new Date(),
          );
          if (count > 0) {
            console.info(
              `[risk-raid] closed ${count} RAID item(s) for archived project ${event.data.projectId}`,
            );
          }
        },
      ),
    );
  }
}
