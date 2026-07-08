import { Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import {
  IDENTITY_ROLE_ASSIGNED,
  IDENTITY_SCOPE_GRANTED,
  type RecordScope,
  type Role,
} from "@epm/shared";
import { PrismaService } from "../../foundation/db/prisma.service.js";
import { AuditService } from "../../foundation/audit/audit.service.js";
import { InProcessEventBus } from "../../foundation/events/event-bus.js";
import { IdentityRepository } from "./identity.repository.js";

@Injectable()
export class RoleAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: IdentityRepository,
    private readonly audit: AuditService,
    private readonly bus: InProcessEventBus,
  ) {}

  async assign(actorId: string, userId: string, role: Role, requestId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await this.repo.assignRole(tx, userId, role, actorId);
      await this.audit.record(
        { actorId, action: "create", entityType: "user_role", entityId: userId, after: { role }, requestId },
        tx,
      );
    });
    await this.bus.publish({
      eventId: randomUUID(),
      eventType: IDENTITY_ROLE_ASSIGNED,
      occurredAt: new Date().toISOString(),
      source: "identity-access",
      data: { userId, role },
    });
  }

  async revoke(actorId: string, userId: string, role: Role, requestId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await this.repo.revokeRole(tx, userId, role);
      await this.audit.record(
        { actorId, action: "delete", entityType: "user_role", entityId: userId, before: { role }, requestId },
        tx,
      );
    });
  }
}

@Injectable()
export class ScopeAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: IdentityRepository,
    private readonly audit: AuditService,
    private readonly bus: InProcessEventBus,
  ) {}

  async grant(actorId: string, userId: string, scope: RecordScope, requestId: string): Promise<string> {
    const scopeId = await this.prisma.$transaction(async (tx) => {
      const row = await this.repo.grantScope(
        tx,
        userId,
        { scopeType: scope.type, scopeId: scope.ids?.[0], subtreeRootId: scope.subtreeRootId },
        actorId,
      );
      await this.audit.record(
        { actorId, action: "create", entityType: "user_scope", entityId: userId, after: scope, requestId },
        tx,
      );
      return row.id;
    });
    await this.bus.publish({
      eventId: randomUUID(),
      eventType: IDENTITY_SCOPE_GRANTED,
      occurredAt: new Date().toISOString(),
      source: "identity-access",
      data: { userId, scopeId },
    });
    return scopeId;
  }

  async revoke(actorId: string, userId: string, scopeId: string, requestId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await this.repo.revokeScope(tx, scopeId);
      await this.audit.record(
        { actorId, action: "delete", entityType: "user_scope", entityId: userId, before: { scopeId }, requestId },
        tx,
      );
    });
  }
}
