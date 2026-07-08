import { Injectable } from "@nestjs/common";
import {
  type AuthContext,
  type ConfigureScoringCommand,
  type ScoringCriterionDTO,
  type ScoringModelDTO,
} from "@epm/shared";
import { AuditService } from "../../../foundation/audit/audit.service.js";
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

    const created = await this.scoringModelRepo.createWithCriteria(
      { name: cmd.name, createdBy: ctx.userId },
      criteria,
    );
    const activated = await this.scoringModelRepo.activate(created.id);

    await this.auditService.record({
      actorId: ctx.userId,
      action: "create",
      entityType: "scoring-model",
      entityId: activated.id,
      after: activated,
      requestId,
    });

    return activated;
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
