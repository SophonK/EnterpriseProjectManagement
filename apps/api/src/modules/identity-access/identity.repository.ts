import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { AppError, type Role } from "@epm/shared";
import { BaseRepository } from "../../foundation/db/base-repository.js";
import { PrismaService } from "../../foundation/db/prisma.service.js";
import type { ScopeRow } from "./logic.js";

@Injectable()
export class IdentityRepository extends BaseRepository {
  readonly schema = "identity" as const;

  constructor(prisma: PrismaService) {
    super(prisma);
  }

  upsertUserBySubject(data: { subject: string; email: string | null; name: string | null }) {
    return this.prisma.user.upsert({
      where: { subject: data.subject },
      create: { subject: data.subject, email: data.email, displayName: data.name },
      update: { email: data.email, displayName: data.name },
    });
  }

  findUserById(id: string) {
    return this.prisma.user.findFirst({ where: { id, deletedAt: null } });
  }

  async listUsers(skip: number, take: number): Promise<{ rows: UserRow[]; total: number }> {
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where: { deletedAt: null },
        skip,
        take,
        orderBy: { createdAt: "desc" },
        include: { roles: { include: { role: true } } },
      }),
      this.prisma.user.count({ where: { deletedAt: null } }),
    ]);
    return { rows, total };
  }

  async rolesOf(userId: string): Promise<Role[]> {
    const rows = await this.prisma.userRole.findMany({ where: { userId }, include: { role: true } });
    return rows.map((r) => r.role.key as Role);
  }

  async scopesOf(userId: string): Promise<ScopeRow[]> {
    const rows = await this.prisma.userScope.findMany({ where: { userId } });
    return rows.map((s) => ({
      scopeType: s.scopeType,
      scopeId: s.scopeId,
      subtreeRootId: s.subtreeRootId,
    }));
  }

  async allRolePermissions(): Promise<Array<{ role: string; permission: string }>> {
    const rows = await this.prisma.rolePermission.findMany({
      include: { role: true, permission: true },
    });
    return rows.map((rp) => ({ role: rp.role.key, permission: rp.permission.key }));
  }

  async assignRole(
    tx: Prisma.TransactionClient,
    userId: string,
    roleKey: string,
    grantedBy: string,
  ): Promise<void> {
    const role = await tx.role.findUnique({ where: { key: roleKey } });
    if (!role) throw AppError.notFound(`role ${roleKey}`);
    await tx.userRole.upsert({
      where: { userId_roleId: { userId, roleId: role.id } },
      create: { userId, roleId: role.id, grantedBy },
      update: {},
    });
  }

  async revokeRole(tx: Prisma.TransactionClient, userId: string, roleKey: string): Promise<void> {
    const role = await tx.role.findUnique({ where: { key: roleKey } });
    if (!role) return;
    await tx.userRole.deleteMany({ where: { userId, roleId: role.id } });
  }

  grantScope(
    tx: Prisma.TransactionClient,
    userId: string,
    scope: { scopeType: string; scopeId?: string; subtreeRootId?: string },
    grantedBy: string,
  ) {
    return tx.userScope.create({
      data: {
        userId,
        scopeType: scope.scopeType,
        scopeId: scope.scopeId ?? null,
        subtreeRootId: scope.subtreeRootId ?? null,
        grantedBy,
      },
    });
  }

  revokeScope(tx: Prisma.TransactionClient, scopeId: string) {
    return tx.userScope.deleteMany({ where: { id: scopeId } });
  }
}

export type UserRow = Prisma.UserGetPayload<{ include: { roles: { include: { role: true } } } }>;
