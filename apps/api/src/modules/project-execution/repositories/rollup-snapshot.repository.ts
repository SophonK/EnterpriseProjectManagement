import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { RollupSummaryDTO } from "@epm/shared";
import { BaseRepository } from "../../../foundation/db/base-repository.js";
import type { PrismaService } from "../../../foundation/db/prisma.service.js";

@Injectable()
export class RollupSnapshotRepository extends BaseRepository {
  readonly schema = "execution" as const;

  constructor(prisma: PrismaService) {
    super(prisma);
  }

  /**
   * Atomic upsert by (portfolioId, programId).
   * Uses REPEATABLE READ isolation so two concurrent callers serialize at the
   * findFirst step — one will see the other's insert and proceed to update.
   */
  async upsert(data: {
    portfolioId: string;
    programId: string | null;
    onTrackCount: number;
    atRiskCount: number;
    offTrackCount: number;
    totalCount: number;
  }): Promise<RollupSummaryDTO> {
    const counts = {
      onTrackCount: data.onTrackCount,
      atRiskCount: data.atRiskCount,
      offTrackCount: data.offTrackCount,
      totalCount: data.totalCount,
      computedAt: new Date(),
    };

    const row = await this.prisma.$transaction(
      async (tx) => {
        const existing = await tx.rollupSnapshot.findFirst({
          where: { portfolioId: data.portfolioId, programId: data.programId },
          select: { id: true },
        });
        return existing
          ? tx.rollupSnapshot.update({ where: { id: existing.id }, data: counts })
          : tx.rollupSnapshot.create({
              data: { portfolioId: data.portfolioId, programId: data.programId, ...counts },
            });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );

    return toDTO(row);
  }

  async find(portfolioId: string, programId: string | null): Promise<RollupSummaryDTO | null> {
    const row = await this.prisma.rollupSnapshot.findFirst({
      where: { portfolioId, programId },
    });
    return row ? toDTO(row) : null;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toDTO(row: {
  portfolioId: string;
  programId: string | null;
  onTrackCount: number;
  atRiskCount: number;
  offTrackCount: number;
  totalCount: number;
  computedAt: Date;
}): RollupSummaryDTO {
  return {
    portfolioId: row.portfolioId,
    programId: row.programId,
    onTrackCount: row.onTrackCount,
    atRiskCount: row.atRiskCount,
    offTrackCount: row.offTrackCount,
    totalCount: row.totalCount,
    computedAt: row.computedAt.toISOString(),
  };
}
