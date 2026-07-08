import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { ScoreCardDTO, CriterionScoreDTO } from "@epm/shared";
import { BaseRepository } from "../../../foundation/db/base-repository.js";
import type { PrismaService } from "../../../foundation/db/prisma.service.js";

@Injectable()
export class ScoreCardRepository extends BaseRepository {
  readonly schema = "intake" as const;

  constructor(prisma: PrismaService) {
    super(prisma);
  }

  /**
   * Upsert the single score card for a demand request (`@@unique([demandRequestId])`)
   * and replace its criterion-score rows, atomically in one transaction. Re-scoring a
   * request updates the same card (one card per request, D3-3): the existing
   * `CriterionScore` rows are deleted and the new set inserted, so the persisted scores
   * always reflect the latest submission.
   */
  async upsert(data: {
    demandRequestId: string;
    scoringModelId: string;
    weightedTotal: number;
    scoredBy: string;
    scores: Array<{ criterionId: string; rawScore: number }>;
  }): Promise<ScoreCardDTO> {
    const weightedTotal = new Prisma.Decimal(data.weightedTotal);

    return this.prisma.$transaction(async (tx) => {
      const card = await tx.scoreCard.upsert({
        where: { demandRequestId: data.demandRequestId },
        create: {
          demandRequestId: data.demandRequestId,
          scoringModelId: data.scoringModelId,
          weightedTotal,
          scoredBy: data.scoredBy,
          updatedAt: new Date(),
        },
        update: {
          scoringModelId: data.scoringModelId,
          weightedTotal,
          scoredBy: data.scoredBy,
          updatedAt: new Date(),
        },
      });

      // Replace the criterion-score rows (delete existing, insert new set).
      await tx.criterionScore.deleteMany({ where: { scoreCardId: card.id } });
      if (data.scores.length > 0) {
        await tx.criterionScore.createMany({
          data: data.scores.map((s) => ({
            scoreCardId: card.id,
            criterionId: s.criterionId,
            rawScore: s.rawScore,
          })),
        });
      }

      const scores = await tx.criterionScore.findMany({
        where: { scoreCardId: card.id },
        orderBy: { createdAt: "asc" },
      });
      return cardToDTO(card, scores);
    });
  }

  async findByRequest(demandRequestId: string): Promise<ScoreCardDTO | null> {
    const card = await this.prisma.scoreCard.findUnique({
      where: { demandRequestId },
      include: { scores: { orderBy: { createdAt: "asc" } } },
    });
    return card ? cardToDTO(card, card.scores) : null;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type ScoreCardRow = {
  id: string;
  demandRequestId: string;
  scoringModelId: string;
  weightedTotal: Prisma.Decimal;
  scoredBy: string;
  scoredAt: Date;
  createdAt: Date;
  updatedAt: Date;
};

type CriterionScoreRow = {
  criterionId: string;
  rawScore: number;
};

function scoreToDTO(row: CriterionScoreRow): CriterionScoreDTO {
  return {
    criterionId: row.criterionId,
    rawScore: row.rawScore,
  };
}

function cardToDTO(row: ScoreCardRow, scores: CriterionScoreRow[]): ScoreCardDTO {
  return {
    id: row.id,
    demandRequestId: row.demandRequestId,
    scoringModelId: row.scoringModelId,
    weightedTotal: Number(row.weightedTotal),
    scores: scores.map(scoreToDTO),
    scoredBy: row.scoredBy,
    scoredAt: row.scoredAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
