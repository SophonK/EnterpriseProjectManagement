import { Inject, Injectable, Optional, type OnModuleInit } from "@nestjs/common";
import { EVENT_BUS, type EventBus } from "../../../foundation/events/event-bus.js";
import {
  type IdempotencyLedger,
  PrismaIdempotencyLedger,
  makeIdempotent,
} from "../../../foundation/events/idempotency.js";
import { PrismaService } from "../../../foundation/db/prisma.service.js";
import { ProjectAlignmentViewRepository } from "../repositories/project-alignment-view.repository.js";
import { AlignmentService } from "../services/alignment.service.js";
import {
  PROJECT_EXECUTION_EVENTS,
  type DomainEvent,
  type ProjectCreatedPayload,
  type StatusChangedPayload,
} from "@epm/shared";

/** DI token — override in tests with InMemoryIdempotencyLedger (see integration.md). */
export const STRATEGY_IDEMPOTENCY_LEDGER = Symbol("STRATEGY_IDEMPOTENCY_LEDGER");

/** Stable handler identity used as the second half of the idempotency ledger key. */
const HANDLER_NAME = "strategy-portfolio.project-alignment-projector";

/** Status assigned to a freshly created project (execution default vocabulary). */
const CREATED_STATUS = "Open";

/**
 * ProjectAlignmentProjector — maintains the local `ProjectAlignmentView` read-model
 * (D3-1) from `project-execution` events. Each subscription is wrapped with
 * `makeIdempotent(...)` (foundation idempotency ledger, dedupe by `eventId`, property P4)
 * and the upsert is guarded by `lastEventAt` so a stale / out-of-order delivery cannot
 * regress the view (resiliency-baseline). After a projection write it delegates to
 * `AlignmentService.evaluateAlignment(projectId)` so a newly active-but-unlinked project
 * is flagged. Mirrors `project-execution/events/project-execution-event.sub.ts`.
 */
@Injectable()
export class ProjectAlignmentProjector implements OnModuleInit {
  private readonly ledger: IdempotencyLedger;

  constructor(
    @Inject(EVENT_BUS) private readonly eventBus: EventBus,
    private readonly prisma: PrismaService,
    private readonly viewRepo: ProjectAlignmentViewRepository,
    private readonly alignmentService: AlignmentService,
    @Optional() @Inject(STRATEGY_IDEMPOTENCY_LEDGER) ledger?: IdempotencyLedger,
  ) {
    this.ledger = ledger ?? new PrismaIdempotencyLedger(prisma);
  }

  onModuleInit(): void {
    // 6.1 — project.created → upsert projection + evaluate alignment (idempotent).
    this.eventBus.subscribe<ProjectCreatedPayload>(
      PROJECT_EXECUTION_EVENTS.PROJECT_CREATED,
      makeIdempotent(
        HANDLER_NAME,
        this.ledger,
        (event: DomainEvent<ProjectCreatedPayload>) => this.onProjectCreated(event),
      ),
    );

    // 6.1 — project.status-changed → upsert projection status + evaluate alignment (idempotent).
    this.eventBus.subscribe<StatusChangedPayload>(
      PROJECT_EXECUTION_EVENTS.STATUS_CHANGED,
      makeIdempotent(
        HANDLER_NAME,
        this.ledger,
        (event: DomainEvent<StatusChangedPayload>) => this.onStatusChanged(event),
      ),
    );
  }

  /**
   * A newly created project is projected with its initial `Open` status and its
   * planned budget (H3 — the created payload now carries `plannedBudget`, so
   * investment-mix budget totals are populated from creation). Alignment is evaluated
   * only when the projection was written (a stale/out-of-order event is a no-op — REL-SP-02).
   */
  private async onProjectCreated(event: DomainEvent<ProjectCreatedPayload>): Promise<void> {
    const written = await this.viewRepo.upsertByProjectId(
      {
        projectId: event.data.projectId,
        name: event.data.name,
        status: CREATED_STATUS,
        plannedBudget: event.data.plannedBudget ?? null,
        portfolioId: event.data.portfolioId,
        programId: event.data.programId,
      },
      new Date(event.occurredAt),
    );

    if (written) {
      await this.alignmentService.evaluateAlignment(event.data.projectId);
    }
  }

  /**
   * A status change mirrors execution's new status into the projection. The payload carries
   * no name/budget, so the existing projection's values are preserved (the projectId is a
   * safe fallback name when the create event has not yet arrived). Alignment is re-evaluated
   * only when the projection was written; on the transition to `Active` an unaligned project
   * is flagged by `evaluateAlignment` (D3-4). Stale events are a guarded no-op.
   */
  private async onStatusChanged(event: DomainEvent<StatusChangedPayload>): Promise<void> {
    const existing = await this.viewRepo.findByProject(event.data.projectId);

    const written = await this.viewRepo.upsertByProjectId(
      {
        projectId: event.data.projectId,
        name: existing?.name ?? event.data.projectId,
        status: event.data.status,
        plannedBudget: existing?.plannedBudget ?? null,
        portfolioId: event.data.portfolioId,
        programId: event.data.programId,
      },
      new Date(event.occurredAt),
    );

    if (written) {
      await this.alignmentService.evaluateAlignment(event.data.projectId);
    }
  }
}
