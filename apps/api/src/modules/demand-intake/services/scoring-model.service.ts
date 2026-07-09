import { Injectable } from "@nestjs/common";
import {
  type AuthContext,
  type ConfigureScoringCommand,
  type ScoringCriterionDTO,
  type ScoringModelDTO,
} from "@epm/shared";
import { AuditService } from "../../../foundation/audit/audit.service.js";
import { PrismaService } from "../../../foundation/db/prisma.service.js";
import {
  ScoringModelRepository,
  type CriterionInput,
} from "../repositories/scoring-model.repository.js";

/** Owns the versioned scoring model and its weighted criteria (US-030). */
@Injectable()
export class ScoringModelService {
  constructor(
    private readonly scoringModelRepo: ScoringModelRepository,
    private readonly auditService: AuditService,
    private readonly prisma: PrismaService,
  ) {}

  // BR-209: single active scoring model version. configureScoring (EPMO Director only,
  // enforced by the guard) creates a new versioned model with its weighted criteria and
  // activates it, atomically deactivating the previously active model so exactly one is
  // active. createdBy comes from the authenticated caller.
  async configureScoring(
    cmd: ConfigureScoringCommand,
    ctx: AuthContext,
    requestId: string,
  ): Promise<ScoringModelDTO> {
    const criteria: CriterionInput[] = cmd.criteria.map((c, index) => ({
      name: c.name,
      weight: c.weight,
      maxScore: c.maxScore,
      goalId: c.goalId ?? null,
      sortOrder: index,
    }));

    // Fold create-with-criteria AND activate (deactivate others + set this active) plus the
    // audit into ONE transaction so the single-active invariant (BR-209) is atomic: the new
    // model becomes active and any prior active model is deactivated in the same commit, and
    // the partial unique index `uq_scoring_model_single_active` rejects a racing second
    // activation (P2002) rather than leaving two active rows.
    return this.prisma.$transaction(async (tx) => {
      const created = await this.scoringModelRepo.createWithCriteria(
        { name: cmd.name, createdBy: ctx.userId },
        criteria,
        tx,
      );
      const activated = await this.scoringModelRepo.activate(created.id, tx);

      await this.auditService.record(
        {
          actorId: ctx.userId,
          action: "create",
          entityType: "scoring-model",
          entityId: activated.id,
          after: activated,
          requestId,
        },
        tx,
      );

      return activated;
    });
  }

  // The single active scoring model, or DEMAND_003 when none is active.
  async getActiveModel(_ctx: AuthContext): Promise<ScoringModelDTO> {
    return this.scoringModelRepo.getActiveOrThrow();
  }

  async listCriteria(
    scoringModelId: string,
    _ctx: AuthContext,
  ): Promise<ScoringCriterionDTO[]> {
    return this.scoringModelRepo.listCriteria(scoringModelId);
  }
}
