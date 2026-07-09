import { Inject, Injectable, Optional } from "@nestjs/common";
import { PROJECT_EXECUTION_EVENTS, SYSTEM_ACTOR_ID } from "@epm/shared";
import type { ProjectCreatedPayload, ProjectArchivedPayload, DomainEvent } from "@epm/shared";
import { EVENT_BUS, type EventBus } from "../../../foundation/events/event-bus.js";
import { PrismaService } from "../../../foundation/db/prisma.service.js";
import { AuditService } from "../../../foundation/audit/audit.service.js";
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
    private readonly auditService: AuditService,
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
          // Close the items and emit one audit row per closed item, atomically: the
          // bulk close and its audit trail commit in a single transaction. Actor is the
          // SYSTEM_ACTOR_ID sentinel (this is a system-driven cascade, not a user edit).
          const closed = await this.prisma.$transaction(async (tx) => {
            const items = await this.raidItemRepo.closeAllForProject(
              event.data.projectId,
              new Date(),
              tx,
            );
            for (const { before, after } of items) {
              await this.auditService.record(
                {
                  entityType: "RaidItem",
                  entityId: after.id,
                  action: "update",
                  actorId: SYSTEM_ACTOR_ID,
                  requestId: event.eventId,
                  before,
                  after,
                },
                tx,
              );
            }
            return items;
          });
          if (closed.length > 0) {
            console.info(
              `[risk-raid] closed ${closed.length} RAID item(s) for archived project ${event.data.projectId}`,
            );
          }
        },
      ),
    );
  }
}
