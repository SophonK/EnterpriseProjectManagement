import { Injectable } from "@nestjs/common";
import {
  AppError,
  type AuthContext,
  type RankedDemandDTO,
  type ScoreCardDTO,
  type ScoreRequestCommand,
} from "@epm/shared";
import { AuditService } from "../../../foundation/audit/audit.service.js";
import { PrismaService } from "../../../foundation/db/prisma.service.js";
import { ScoreCardRepository } from "../repositories/score-card.repository.js";
import { ScoringModelRepository } from "../repositories/scoring-model.repository.js";
import { DemandRequestRepository } from "../repositories/demand-request.repository.js";
import { ScoreCalculator, type Rankable } from "./score-calculator.js";

/** Demand statuses in which a request may be scored / re-scored (D3-5). */
const SCORABLE_STATUSES = ["Screening", "Evaluation"] as const;

/** Enters per-criterion raw scores and computes the weighted total / ranking (US-030). */
@Injectable()
export class ScoringService {
  constructor(
    private readonly scoreCardRepo: ScoreCardRepository,
    private readonly scoringModelRepo: ScoringModelRepository,
    private readonly demandRepo: DemandRequestRepository,
    private readonly auditService: AuditService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * BR-203: score a request against the active scoring model. Validates the request is
   * scorable (Screening/Evaluation, else DEMAND_007), each criterionId belongs to the
   * active model, and each rawScore ≤ that criterion's maxScore (else DEMAND_004);
   * delegates the math to ScoreCalculator; upserts the single ScoreCard (one card per
   * request, D3-3) and audits.
   */
  async scoreRequest(
    demandRequestId: string,
    cmd: ScoreRequestCommand,
    ctx: AuthContext,
    requestId: string,
  ): Promise<ScoreCardDTO> {
    // REL-DI-03 / SEC-DI-05: row lock + all validation (scorable status, known criteria,
    // in-range + unique criterionId) before the write, then upsert + audit in ONE transaction.
    return this.prisma.$transaction(async (tx) => {
      const request = await this.demandRepo.findByIdScopedForUpdate(demandRequestId, ctx, tx); // DEMAND_002
      if (!SCORABLE_STATUSES.includes(request.status as (typeof SCORABLE_STATUSES)[number])) {
        throw new AppError("DEMAND_007", `demand request ${demandRequestId} is not scorable`);
      }

      const model = await this.scoringModelRepo.getActiveOrThrow(); // DEMAND_003
      const criterionById = new Map(model.criteria.map((c) => [c.id, c]));

      // Reject a duplicate criterionId up front (else the second insert hits the
      // `uq_criterion_score_card_criterion` unique index → P2002 → 500). Fail as DEMAND_004 (400).
      const seen = new Set<string>();
      for (const s of cmd.scores) {
        if (seen.has(s.criterionId)) {
          throw new AppError(
            "DEMAND_004",
            `duplicate criterionId ${s.criterionId} in score submission`,
          );
        }
        seen.add(s.criterionId);

        const criterion = criterionById.get(s.criterionId);
        if (!criterion) {
          throw new AppError(
            "DEMAND_004",
            `criterion ${s.criterionId} does not belong to the active scoring model`,
          );
        }
        if (s.rawScore > criterion.maxScore) {
          throw new AppError(
            "DEMAND_004",
            `rawScore ${s.rawScore} exceeds maxScore ${criterion.maxScore} for criterion ${s.criterionId}`,
          );
        }
      }

      const weightedTotal = ScoreCalculator.computeWeightedTotal(
        model.criteria.map((c) => ({ id: c.id, weight: c.weight, maxScore: c.maxScore })),
        cmd.scores.map((s) => ({ criterionId: s.criterionId, rawScore: s.rawScore })),
      );

      const card = await this.scoreCardRepo.upsert(
        {
          demandRequestId,
          scoringModelId: model.id,
          weightedTotal,
          scoredBy: ctx.userId,
          scores: cmd.scores.map((s) => ({ criterionId: s.criterionId, rawScore: s.rawScore })),
        },
        tx,
      );

      await this.auditService.record(
        {
          actorId: ctx.userId,
          action: "update",
          entityType: "score-card",
          entityId: card.id,
          after: card,
          requestId,
        },
        tx,
      );

      return card;
    });
  }

  /**
   * BR-204: ranked list of rankable requests, descending by weightedTotal with a stable
   * tie-break by submittedAt ascending. weightedTotal is read from the persisted ScoreCard
   * (materialized at score time); an unscored rankable request contributes 0.
   */
  async rankRequests(_ctx: AuthContext): Promise<RankedDemandDTO[]> {
    const requests = await this.demandRepo.listForRanking();

    const rankables: Rankable[] = [];
    for (const request of requests) {
      const card = await this.scoreCardRepo.findByRequest(request.id);
      rankables.push({
        demandRequestId: request.id,
        weightedTotal: card?.weightedTotal ?? 0,
        submittedAt: request.submittedAt,
      });
    }

    const requestById = new Map(requests.map((r) => [r.id, r]));
    return ScoreCalculator.rank(rankables).map((item) => {
      const request = requestById.get(item.demandRequestId);
      return {
        demandRequestId: item.demandRequestId,
        title: request?.title ?? "",
        status: request?.status ?? "Submitted",
        weightedTotal: item.weightedTotal,
        rank: item.rank,
        submittedAt: item.submittedAt,
      };
    });
  }
}
