import { Module } from "@nestjs/common";
import { DbModule } from "../../foundation/db/db.module.js";
import { AuditModule } from "../../foundation/audit/audit.module.js";
import { EventsModule } from "../../foundation/events/events.module.js";
import { AuthModule } from "../../foundation/auth/auth.module.js";
import { RbacRegistry } from "../../foundation/auth/rbac.registry.js";

import { DemandRequestRepository } from "./repositories/demand-request.repository.js";
import { ScoringModelRepository } from "./repositories/scoring-model.repository.js";
import { ScoreCardRepository } from "./repositories/score-card.repository.js";
import { GateDecisionRepository } from "./repositories/gate-decision.repository.js";

import { DemandRequestService } from "./services/demand-request.service.js";
import { ScoringModelService } from "./services/scoring-model.service.js";
import { ScoringService } from "./services/scoring.service.js";
import { StageGateService } from "./services/stage-gate.service.js";
import { PromotionService } from "./services/promotion.service.js";

import { DemandRequestController } from "./controllers/demand-request.controller.js";
import { ScoringModelController } from "./controllers/scoring-model.controller.js";
import { ScoringController } from "./controllers/scoring.controller.js";
import { StageGateController } from "./controllers/stage-gate.controller.js";
import { PromotionController } from "./controllers/promotion.controller.js";

/**
 * demand-intake unit (US-029..US-032). Publisher-only (D3-7): its services publish the
 * four `demand-intake.demand.*` events directly through the foundation EventBus; there is
 * no event subscriber and no idempotency ledger. The pure `ScoreCalculator` is used via
 * static methods, so it is not a DI provider. Nothing consumes demand-intake in-process,
 * so the module exports nothing.
 */
@Module({
  imports: [DbModule, AuditModule, EventsModule, AuthModule],
  controllers: [
    // ScoringController is declared before DemandRequestController so the static
    // `GET /intake/requests/ranked` route wins over `GET /intake/requests/:id`.
    ScoringController,
    DemandRequestController,
    ScoringModelController,
    StageGateController,
    PromotionController,
  ],
  providers: [
    DemandRequestRepository,
    ScoringModelRepository,
    ScoreCardRepository,
    GateDecisionRepository,
    DemandRequestService,
    ScoringModelService,
    ScoringService,
    StageGateService,
    PromotionService,
  ],
})
export class DemandIntakeModule {
  constructor(private readonly rbac: RbacRegistry) {
    // EPMO Director — configure scoring models, score, view all requests, and drive the
    // full stage-gate incl. the final approval gate; also submit/promote (api-spec:
    // "Portfolio Manager (also EPMO Director)").
    this.rbac.grant(
      "EPMO_DIRECTOR",
      "intake:request:submit",
      "intake:request:read",
      "intake:request:score",
      "intake:request:advance",
      "intake:request:reject",
      "intake:request:promote",
      "intake:scoring-model:configure",
      "intake:scoring-model:read",
      // Per-gate permissions (D3-4) — Director holds all three, incl. final approval.
      "intake-gate:screening",
      "intake-gate:evaluation",
      "intake-gate:approval",
    );

    // Portfolio Manager — submit intake, score, advance/reject gates, promote; record-scoped
    // to own submissions. Holds the screening + evaluation per-gate permissions but NOT the
    // final approval gate: separation of duties (BR/SEC-DI-03) reserves Evaluation→Approved for
    // the EPMO Director, so a PM cannot self-approve their own demand. NOT scoring-model config.
    this.rbac.grant(
      "PORTFOLIO_MANAGER",
      "intake:request:submit",
      "intake:request:read",
      "intake:request:score",
      "intake:request:advance",
      "intake:request:reject",
      "intake:request:promote",
      "intake:scoring-model:read",
      // Per-gate permissions (D3-4) — PM advances up to Evaluation; final approval is Director-only.
      "intake-gate:screening",
      "intake-gate:evaluation",
    );
  }
}
