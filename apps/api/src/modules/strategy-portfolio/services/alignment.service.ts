import { Inject, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import {
  STRATEGY_PORTFOLIO_EVENTS,
  type AuthContext,
  type UnalignedProjectDTO,
  type UnalignedReportDTO,
} from "@epm/shared";
import { EVENT_BUS, type EventBus } from "../../../foundation/events/event-bus.js";
import { GoalLinkRepository } from "../repositories/goal-link.repository.js";
import { ProjectAlignmentViewRepository } from "../repositories/project-alignment-view.repository.js";

/** Pure domain logic over links + projection (US-008 / US-010). */
@Injectable()
export class AlignmentService {
  constructor(
    private readonly goalLinkRepo: GoalLinkRepository,
    private readonly viewRepo: ProjectAlignmentViewRepository,
    @Inject(EVENT_BUS) private readonly eventBus: EventBus,
  ) {}

  /**
   * BR-103: a project is aligned iff it has >= 1 GoalLink. `evaluateAlignment` is a total,
   * deterministic boolean function (no third state, never null) and is idempotent — for a
   * fixed set of links it always returns the same value and leaves the projection in the
   * same state. It materializes the derived `aligned` flag and, per BR-104, flags an
   * active-but-unaligned project by publishing `strategy-portfolio.project.flagged-unaligned`.
   */
  async evaluateAlignment(projectId: string): Promise<boolean> {
    const linkCount = await this.goalLinkRepo.countByProject(projectId);
    const aligned = linkCount >= 1; // BR-103: total boolean, no third state

    const view = await this.viewRepo.findByProject(projectId);
    await this.viewRepo.setAligned(projectId, aligned);

    // BR-104: an active project with no link is flagged so its owner is warned.
    if (view && view.status === "Active" && !aligned) {
      await this.eventBus.publish({
        eventId: randomUUID(),
        eventType: STRATEGY_PORTFOLIO_EVENTS.PROJECT_FLAGGED_UNALIGNED,
        occurredAt: new Date().toISOString(),
        source: "strategy-portfolio",
        data: {
          projectId,
          name: view.name,
          portfolioId: view.portfolioId,
        },
      });
    }

    return aligned;
  }

  /**
   * BR-109: projection rows where `status = 'Active' AND aligned = false`, each enriched
   * with owner and portfolio. Empty result → `fullyAligned = true` (empty-state).
   */
  async listUnaligned(_ctx: AuthContext): Promise<UnalignedReportDTO> {
    const rows = await this.viewRepo.listUnaligned();
    const items: UnalignedProjectDTO[] = rows.map((r) => ({
      projectId: r.projectId,
      name: r.name,
      ownerId: r.ownerId ?? "",
      portfolioId: r.portfolioId,
      portfolioName: r.portfolioName,
    }));
    return { items, fullyAligned: items.length === 0 };
  }
}
