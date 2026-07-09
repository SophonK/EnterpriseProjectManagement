import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { AppError } from "@epm/shared";
import type { DemandRequestDTO, DemandStatus, IntakeGate, AuthContext } from "@epm/shared";
import { BaseRepository } from "../../../foundation/db/base-repository.js";
import { PrismaService } from "../../../foundation/db/prisma.service.js";

/** Demand-request statuses that are candidates for scoring / ranking (D3-5). */
const RANKABLE_STATUSES: readonly DemandStatus[] = ["Screening", "Evaluation", "Approved"];

@Injectable()
export class DemandRequestRepository extends BaseRepository {
  readonly schema = "intake" as const;

  constructor(prisma: PrismaService) {
    super(prisma);
  }

  async create(data: {
    title: string;
    sponsor: string;
    description: string;
    expectedValue?: number | null;
    submittedBy: string;
  }): Promise<DemandRequestDTO> {
    const row = await this.prisma.demandRequest.create({
      data: {
        title: data.title,
        sponsor: data.sponsor,
        description: data.description,
        expectedValue: data.expectedValue != null ? new Prisma.Decimal(data.expectedValue) : null,
        submittedBy: data.submittedBy,
        updatedAt: new Date(),
      },
    });
    return toDTO(row);
  }

  /**
   * Scoped read — throws DEMAND_002 if not found OR the caller lacks access
   * (info hiding). An EPMO Director sees any request; everyone else is limited to
   * their own submissions (`submittedBy`).
   */
  async findByIdScoped(id: string, ctx: AuthContext): Promise<DemandRequestDTO> {
    const scopeWhere = buildScopeWhere(ctx);
    const row = await this.prisma.demandRequest.findFirst({
      where: { ...scopeWhere, id },
    });
    if (!row) throw new AppError("DEMAND_002", `Demand request ${id} not found`);
    return toDTO(row);
  }

  /**
   * Read-for-update: the same scoped read as `findByIdScoped`, but taken inside a caller's
   * transaction after a pessimistic `SELECT ... FOR UPDATE` row lock on the demand row
   * (REL-DI-03 / SEC-DI-05). Gate / promote / score mutations call this first so two
   * concurrent transactions cannot double-advance the same request: the second blocks on the
   * lock until the first commits, then re-reads the (now updated) status and fails its
   * transition check. Throws DEMAND_002 when the row does not exist or is out of scope.
   */
  async findByIdScopedForUpdate(
    id: string,
    ctx: AuthContext,
    tx: Prisma.TransactionClient,
  ): Promise<DemandRequestDTO> {
    await tx.$queryRaw`SELECT id FROM "intake"."demand_request" WHERE "id" = ${id}::uuid FOR UPDATE`;
    const scopeWhere = buildScopeWhere(ctx);
    const row = await tx.demandRequest.findFirst({ where: { ...scopeWhere, id } });
    if (!row) throw new AppError("DEMAND_002", `Demand request ${id} not found`);
    return toDTO(row);
  }

  /**
   * Record-scoped list: EPMO Director sees all requests, everyone else only their
   * own submissions (`submittedBy`). Newest first. An optional `status` narrows the
   * result to a single DemandStatus (api-spec `?status=`).
   */
  async findManyScoped(ctx: AuthContext, status?: DemandStatus): Promise<DemandRequestDTO[]> {
    const scopeWhere = buildScopeWhere(ctx);
    const where: Prisma.DemandRequestWhereInput =
      status !== undefined ? { ...scopeWhere, status } : scopeWhere;
    const rows = await this.prisma.demandRequest.findMany({
      where,
      orderBy: { submittedAt: "desc" },
    });
    return rows.map(toDTO);
  }

  /**
   * Advance the state machine / lifecycle in a single write. `status` is always set;
   * `currentGate`, `rejectionReason`, and `promotedProjectId` are applied only when
   * provided (so a reject can set the reason without touching the gate, and a promote
   * can stamp `promotedProjectId` without touching the reason). Throws DEMAND_002 when
   * the request does not exist.
   */
  async updateStatusGate(
    id: string,
    data: {
      status: DemandStatus;
      currentGate?: IntakeGate;
      rejectionReason?: string | null;
      promotedProjectId?: string | null;
    },
    tx?: Prisma.TransactionClient,
  ): Promise<DemandRequestDTO> {
    const client = tx ?? this.prisma;
    const updateData: Prisma.DemandRequestUpdateInput = {
      status: data.status,
      updatedAt: new Date(),
    };
    if (data.currentGate !== undefined) updateData.currentGate = data.currentGate;
    if (data.rejectionReason !== undefined) updateData.rejectionReason = data.rejectionReason;
    if (data.promotedProjectId !== undefined) updateData.promotedProjectId = data.promotedProjectId;

    try {
      const row = await client.demandRequest.update({ where: { id }, data: updateData });
      return toDTO(row);
    } catch (err) {
      if (isPrismaNotFound(err)) throw new AppError("DEMAND_002", `Demand request ${id} not found`);
      throw err;
    }
  }

  /**
   * All demand requests that are candidates for scoring / ranking — those in an active,
   * scorable/ranked status (`Screening`, `Evaluation`, `Approved`). Ordered by
   * `submittedAt` ascending to match the stable ranking tie-break (P2).
   */
  async listForRanking(): Promise<DemandRequestDTO[]> {
    const rows = await this.prisma.demandRequest.findMany({
      where: { status: { in: RANKABLE_STATUSES as DemandStatus[] } },
      orderBy: { submittedAt: "asc" },
    });
    return rows.map(toDTO);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildScopeWhere(ctx: AuthContext): Prisma.DemandRequestWhereInput {
  if (ctx.roles.includes("EPMO_DIRECTOR")) return {}; // Director: all requests
  return { submittedBy: ctx.userId }; // Portfolio Manager (and others): own submissions only
}

type DemandRequestRow = {
  id: string;
  title: string;
  sponsor: string;
  description: string;
  expectedValue: Prisma.Decimal | null;
  status: string;
  currentGate: string;
  rejectionReason: string | null;
  submittedBy: string;
  submittedAt: Date;
  promotedProjectId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

function toDTO(row: DemandRequestRow): DemandRequestDTO {
  return {
    id: row.id,
    title: row.title,
    sponsor: row.sponsor,
    description: row.description,
    expectedValue: row.expectedValue != null ? Number(row.expectedValue) : null,
    status: row.status as DemandStatus,
    currentGate: row.currentGate as IntakeGate,
    rejectionReason: row.rejectionReason,
    submittedBy: row.submittedBy,
    submittedAt: row.submittedAt.toISOString(),
    promotedProjectId: row.promotedProjectId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function isPrismaNotFound(err: unknown): boolean {
  return (
    err != null &&
    typeof err === "object" &&
    "code" in err &&
    (err as { code: string }).code === "P2025"
  );
}
