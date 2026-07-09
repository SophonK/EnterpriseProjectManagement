import { Injectable } from "@nestjs/common";
import { AppError } from "@epm/shared";
import type {
  AuthContext,
  CreateResourceCommand,
  UpdateResourceCommand,
  ResourceDTO,
  ResourceFilter,
  ResourceListDTO,
} from "@epm/shared";
import { AuditService } from "../../../foundation/audit/audit.service.js";
import { ResourceRepository } from "../repositories/resource.repository.js";
import { AllocationRepository } from "../repositories/allocation.repository.js";

@Injectable()
export class ResourceService {
  constructor(
    private readonly resourceRepo: ResourceRepository,
    private readonly allocationRepo: AllocationRepository,
    private readonly auditService: AuditService,
  ) {}

  async createResource(
    cmd: CreateResourceCommand,
    ctx: AuthContext,
    requestId: string,
  ): Promise<ResourceDTO> {
    const poolExists = await this.resourceRepo.poolExists(cmd.poolId);
    if (!poolExists) throw new AppError("RESOURCE_002", `Pool ${cmd.poolId} not found`);

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
}
