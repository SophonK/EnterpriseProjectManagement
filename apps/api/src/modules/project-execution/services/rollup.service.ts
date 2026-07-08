import { Inject, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import {
  PROJECT_EXECUTION_EVENTS,
  type RollupSummaryDTO,
} from "@epm/shared";
import { EVENT_BUS, type EventBus } from "../../../foundation/events/event-bus.js";
import { PrismaService } from "../../../foundation/db/prisma.service.js";
import { RollupSnapshotRepository } from "../repositories/rollup-snapshot.repository.js";

interface HealthCount { health: string; _count: { health: number } }

@Injectable()
export class RollupService {
  constructor(
    private readonly rollupRepo: RollupSnapshotRepository,
    private readonly prisma: PrismaService,
    @Inject(EVENT_BUS) private readonly eventBus: EventBus,
  ) {}

  async recomputeRollup(portfolioId: string, programId: string | null): Promise<RollupSummaryDTO> {
    const counts = await this.computeCounts(portfolioId, programId);
    const snapshot = await this.rollupRepo.upsert({ portfolioId, programId, ...counts });

    await this.eventBus.publish({
      eventId: randomUUID(),
      eventType: PROJECT_EXECUTION_EVENTS.ROLLUP_RECOMPUTED,
      occurredAt: new Date().toISOString(),
      source: "project-execution",
      data: {
        portfolioId,
        programId,
        ...counts,
      },
    });

    return snapshot;
  }

  async getRollup(portfolioId: string, programId: string | null): Promise<RollupSummaryDTO | null> {
    return this.rollupRepo.find(portfolioId, programId);
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private async computeCounts(
    portfolioId: string,
    programId: string | null,
  ): Promise<{ onTrackCount: number; atRiskCount: number; offTrackCount: number; totalCount: number }> {
    const rows = await (this.prisma.project.groupBy as (args: unknown) => Promise<HealthCount[]>)({
      by: ["health"],
      where: {
        portfolioId,
        ...(programId ? { programId } : {}),
        archivedAt: null,
        status: { not: "Cancelled" },
      },
      _count: { health: true },
    });

    let onTrackCount = 0;
    let atRiskCount  = 0;
    let offTrackCount = 0;

    for (const row of rows) {
      const n = row._count.health;
      if (row.health === "OnTrack")  onTrackCount  += n;
      if (row.health === "AtRisk")   atRiskCount   += n;
      if (row.health === "OffTrack") offTrackCount += n;
    }

    return {
      onTrackCount,
      atRiskCount,
      offTrackCount,
      totalCount: onTrackCount + atRiskCount + offTrackCount,
    };
  }
}
