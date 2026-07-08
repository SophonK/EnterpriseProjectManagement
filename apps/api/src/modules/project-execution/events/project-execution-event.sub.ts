import { Inject, Injectable, Optional, type OnModuleInit } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { EVENT_BUS, type EventBus } from "../../../foundation/events/event-bus.js";
import {
  type IdempotencyLedger,
  PrismaIdempotencyLedger,
  makeIdempotent,
} from "../../../foundation/events/idempotency.js";
import { PrismaService } from "../../../foundation/db/prisma.service.js";
import { ProjectService } from "../services/project.service.js";
import { RollupService } from "../services/rollup.service.js";
import type { DomainEvent, StatusChangedPayload, Role } from "@epm/shared";

/** DI token — override in tests with InMemoryIdempotencyLedger */
export const EXECUTION_IDEMPOTENCY_LEDGER = Symbol("EXECUTION_IDEMPOTENCY_LEDGER");

interface DemandPromotedPayload {
  demandId: string;
  name: string;
  portfolioId: string;
  programId?: string | null;
  plannedStart: string;
  plannedEnd: string;
  plannedBudget?: number | null;
}

@Injectable()
export class ProjectExecutionEventSub implements OnModuleInit {
  private readonly ledger: IdempotencyLedger;

  constructor(
    @Inject(EVENT_BUS) private readonly eventBus: EventBus,
    private readonly prisma: PrismaService,
    private readonly projectService: ProjectService,
    private readonly rollupService: RollupService,
    @Optional() @Inject(EXECUTION_IDEMPOTENCY_LEDGER) ledger?: IdempotencyLedger,
  ) {
    this.ledger = ledger ?? new PrismaIdempotencyLedger(prisma);
  }

  onModuleInit(): void {
    // 6.1 — DemandPromoted → create project (idempotent)
    this.eventBus.subscribe<DemandPromotedPayload>(
      "demand-intake.demand.promoted",
      makeIdempotent(
        "project-execution.demand-promoted",
        this.ledger,
        async (event: DomainEvent<DemandPromotedPayload>) => {
          const systemCtx = {
            userId: "system",
            roles: ["EPMO_DIRECTOR"] as Role[],
            recordScopes: [],
          };
          await this.projectService.createProject(
            {
              name:           event.data.name,
              portfolioId:    event.data.portfolioId,
              programId:      event.data.programId ?? null,
              plannedStart:   event.data.plannedStart,
              plannedEnd:     event.data.plannedEnd,
              plannedBudget:  event.data.plannedBudget ?? null,
              sourceDemandId: event.data.demandId,
            },
            systemCtx,
            randomUUID(),
          );
        },
      ),
    );

    // 6.2 — StatusChanged → recompute roll-up
    this.eventBus.subscribe<StatusChangedPayload>(
      "project-execution.project.status-changed",
      async (event: DomainEvent<StatusChangedPayload>) => {
        await this.rollupService.recomputeRollup(
          event.data.portfolioId,
          event.data.programId,
        );
        if (event.data.programId) {
          await this.rollupService.recomputeRollup(event.data.portfolioId, null);
        }
      },
    );
  }
}
