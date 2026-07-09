import { Injectable } from "@nestjs/common";
import { AppError, buildScopedRef, canAccessRecord, isDirector } from "@epm/shared";
import type {
  AuthContext,
  CreateResourceCommand,
  UpdateResourceCommand,
  CreateResourcePoolCommand,
  SetCapacityPeriodCommand,
  ResourceDTO,
  ResourceFilter,
  ResourceListDTO,
  ResourcePoolDTO,
  CapacityPeriodDTO,
} from "@epm/shared";
import { AuditService } from "../../../foundation/audit/audit.service.js";
import { ResourceRepository } from "../repositories/resource.repository.js";
import { AllocationRepository } from "../repositories/allocation.repository.js";
import { CapacityPeriodRepository } from "../repositories/capacity-period.repository.js";
import { firstOfMonth } from "./allocation.service.js";

@Injectable()
export class ResourceService {
  constructor(
    private readonly resourceRepo: ResourceRepository,
    private readonly allocationRepo: AllocationRepository,
    private readonly capacityPeriodRepo: CapacityPeriodRepository,
    private readonly auditService: AuditService,
  ) {}

  /**
   * H1: a non-Director caller may only create a resource in — or move a resource into —
   * a pool covered by one of their `resource-pool` record scopes. Directors bypass.
   * Reuses the same scope model as `buildResourceScopeWhere` (RecordScope of type
   * "resource-pool") via the shared `canAccessRecord` helper. Deny-by-default.
   */
  private assertPoolInScope(poolId: string, ctx: AuthContext): void {
    if (canAccessRecord(ctx, buildScopedRef("resource-pool", poolId))) return;
    throw new AppError("RESOURCE_006", `Pool ${poolId} is not within your scope`);
  }

  async createResource(
    cmd: CreateResourceCommand,
    ctx: AuthContext,
    requestId: string,
  ): Promise<ResourceDTO> {
    const poolExists = await this.resourceRepo.poolExists(cmd.poolId);
    if (!poolExists) throw new AppError("RESOURCE_002", `Pool ${cmd.poolId} not found`);

    this.assertPoolInScope(cmd.poolId, ctx);

    const duplicate = await this.resourceRepo.findByEmail(cmd.email);
    if (duplicate) throw new AppError("RESOURCE_003", `Resource with email ${cmd.email} already exists`);

    const dto = await this.resourceRepo.create({
      name: cmd.name,
      email: cmd.email,
      poolId: cmd.poolId,
      fteCapacity: cmd.fteCapacity,
      createdBy: ctx.userId,
      skills: cmd.skills,
    });

    await this.auditService.record({
      actorId: ctx.userId,
      action: "create",
      entityType: "resource",
      entityId: dto.id,
      after: dto,
      requestId,
    });

    return dto;
  }

  async updateResource(
    id: string,
    cmd: UpdateResourceCommand,
    ctx: AuthContext,
    requestId: string,
  ): Promise<ResourceDTO> {
    const before = await this.resourceRepo.findByIdOrThrow(id, ctx);

    if (cmd.poolId && cmd.poolId !== before.poolId) {
      const poolExists = await this.resourceRepo.poolExists(cmd.poolId);
      if (!poolExists) throw new AppError("RESOURCE_002", `Pool ${cmd.poolId} not found`);
      // H1: the caller must hold a scope over the DESTINATION pool before moving a resource into it.
      this.assertPoolInScope(cmd.poolId, ctx);
    }

    if (cmd.email && cmd.email !== before.email) {
      const duplicate = await this.resourceRepo.findByEmail(cmd.email);
      if (duplicate) throw new AppError("RESOURCE_003", `Resource with email ${cmd.email} already exists`);
    }

    const dto = await this.resourceRepo.update(id, {
      name: cmd.name,
      email: cmd.email,
      poolId: cmd.poolId,
      fteCapacity: cmd.fteCapacity,
      skills: cmd.skills,
    });

    await this.auditService.record({
      actorId: ctx.userId,
      action: "update",
      entityType: "resource",
      entityId: id,
      before,
      after: dto,
      requestId,
    });

    return dto;
  }

  async deleteResource(
    id: string,
    ctx: AuthContext,
    requestId: string,
  ): Promise<void> {
    const before = await this.resourceRepo.findByIdOrThrow(id, ctx);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const futureAllocations = await this.allocationRepo.findActiveForResource(id, today);
    if (futureAllocations.length > 0) {
      await this.resourceRepo.softDelete(id);
    } else {
      await this.resourceRepo.hardDelete(id);
    }

    await this.auditService.record({
      actorId: ctx.userId,
      action: "delete",
      entityType: "resource",
      entityId: id,
      before,
      requestId,
    });
  }

  async getResource(id: string, ctx: AuthContext): Promise<ResourceDTO> {
    return this.resourceRepo.findByIdOrThrow(id, ctx);
  }

  async listResources(filter: ResourceFilter, ctx: AuthContext): Promise<ResourceListDTO> {
    const { data, total } = await this.resourceRepo.findMany(filter, ctx);
    return {
      data,
      total,
      page: filter.page ?? 1,
      pageSize: Math.min(filter.pageSize ?? 20, 100),
    };
  }

  // -------------------------------------------------------------------------
  // Resource pools (api-spec: GET/POST /api/v1/resource-pools)
  // -------------------------------------------------------------------------

  async listPools(): Promise<ResourcePoolDTO[]> {
    return this.resourceRepo.listPools();
  }

  async createPool(
    cmd: CreateResourcePoolCommand,
    ctx: AuthContext,
    requestId: string,
  ): Promise<ResourcePoolDTO> {
    // api-spec / BR: pools are created by EPMO_DIRECTOR only. resource:write alone
    // (also held by RESOURCE_MANAGER) is not sufficient — enforce the Director gate here.
    if (!isDirector(ctx)) {
      throw new AppError("RESOURCE_006", "Only EPMO_DIRECTOR may create resource pools");
    }
    const pool = await this.resourceRepo.createPool(cmd.name);
    await this.auditService.record({
      actorId: ctx.userId,
      action: "create",
      entityType: "resource-pool",
      entityId: pool.id,
      after: pool,
      requestId,
    });
    return pool;
  }

  // -------------------------------------------------------------------------
  // Capacity-period override (BR-2) — exposes the previously-unreachable upsert path.
  // -------------------------------------------------------------------------

  async setCapacityPeriod(
    resourceId: string,
    cmd: SetCapacityPeriodCommand,
    ctx: AuthContext,
    requestId: string,
  ): Promise<CapacityPeriodDTO> {
    // Scope + existence check on the resource (throws RESOURCE_005 if out of scope).
    await this.resourceRepo.findByIdOrThrow(resourceId, ctx);
    const periodStart = firstOfMonth(new Date(cmd.periodStart)); // BR-5 normalisation
    const dto = await this.capacityPeriodRepo.upsert({
      resourceId,
      periodStart,
      capacityPct: cmd.capacityPct,
    });
    await this.auditService.record({
      actorId: ctx.userId,
      action: "update",
      entityType: "capacity-period",
      entityId: dto.id,
      after: dto,
      requestId,
    });
    return dto;
  }
}
