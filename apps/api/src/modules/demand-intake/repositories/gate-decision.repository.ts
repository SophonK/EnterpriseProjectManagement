import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { GateDecisionDTO, IntakeGate, GateOutcome } from "@epm/shared";
import { BaseRepository } from "../../../foundation/db/base-repository.js";
import { PrismaService } from "../../../foundation/db/prisma.service.js";

@Injectable()
export class GateDecisionRepository extends BaseRepository {
  readonly schema = "intake" as const;

  constructor(prisma: PrismaService) {
    super(prisma);
  }

  /**
   * Append a stage-gate decision (advance or reject). `toGate` is null on reject. An optional
   * transaction client routes the write through the caller's transaction so the decision, the
   * status change, and the audit row commit atomically (REL-DI-03).
   */
  async append(
    data: {
      demandRequestId: string;
      fromGate: IntakeGate;
      toGate: IntakeGate | null;
      decision: GateOutcome;
      reason?: string | null;
      decidedBy: string;
    },
    tx?: Prisma.TransactionClient,
  ): Promise<GateDecisionDTO> {
    const client = tx ?? this.prisma;
    const row = await client.gateDecision.create({
      data: {
        demandRequestId: data.demandRequestId,
        fromGate: data.fromGate,
        toGate: data.toGate,
        decision: data.decision,
        reason: data.reason ?? null,
        decidedBy: data.decidedBy,
      },
    });
    return toDTO(row);
  }

  /** The full gate-decision history for a request, oldest first. */
  async listByRequest(demandRequestId: string): Promise<GateDecisionDTO[]> {
    const rows = await this.prisma.gateDecision.findMany({
      where: { demandRequestId },
      orderBy: { decidedAt: "asc" },
    });
    return rows.map(toDTO);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type GateDecisionRow = {
  id: string;
  demandRequestId: string;
  fromGate: string;
  toGate: string | null;
  decision: string;
  reason: string | null;
  decidedBy: string;
  decidedAt: Date;
};

function toDTO(row: GateDecisionRow): GateDecisionDTO {
  return {
    id: row.id,
    demandRequestId: row.demandRequestId,
    fromGate: row.fromGate as IntakeGate,
    toGate: row.toGate as IntakeGate | null,
    decision: row.decision as GateOutcome,
    reason: row.reason,
    decidedBy: row.decidedBy,
    decidedAt: row.decidedAt.toISOString(),
  };
}
