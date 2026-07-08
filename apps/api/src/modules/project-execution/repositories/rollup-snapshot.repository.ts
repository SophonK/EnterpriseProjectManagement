import { Injectable } from "@nestjs/common";
import type { RollupSummaryDTO } from "@epm/shared";
import { BaseRepository } from "../../../foundation/db/base-repository.js";
import type { PrismaService } from "../../../foundation/db/prisma.service.js";

@Injectable()
export class RollupSnapshotRepository extends BaseRepository {
  readonly schema = "execution" as const;

  constructor(prisma: PrismaService) {
    super(prisma);
  }

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

    // The compound unique (portfolioId, programId) includes a nullable column, so it
    // cannot be used as a where-unique key. Do a nullable-safe find-then-update/create.
    const existing = await this.prisma.rollupSnapshot.findFirst({
      where: { portfolioId: data.portfolioId, programId: data.programId },
      select: { id: true },
    });

    const row = existing
      ? await this.prisma.rollupSnapshot.update({
          where: { id: existing.id },
          data: counts,
        })
      : await this.prisma.rollupSnapshot.create({
          data: { portfolioId: data.portfolioId, programId: data.programId, ...counts },
        });

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