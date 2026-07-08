import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Req,
} from "@nestjs/common";
import type { Request } from "express";
import { AppError, type Role } from "@epm/shared";
import { RequirePermission } from "../../foundation/auth/decorators.js";
import { getAuth, getRequestId } from "../../foundation/logging/request-context.js";
import { PrismaService } from "../../foundation/db/prisma.service.js";
import { IdentityRepository } from "./identity.repository.js";
import { RoleAdminService, ScopeAdminService } from "./admin.services.js";
import { assignRoleSchema, grantScopeSchema, listQuerySchema } from "./dto.js";

@Controller("api/v1/identity")
export class IdentityAdminController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: IdentityRepository,
    private readonly roleAdmin: RoleAdminService,
    private readonly scopeAdmin: ScopeAdminService,
  ) {}

  @RequirePermission("identity:list-users")
  @Get("users")
  async listUsers(@Query() query: unknown) {
    const { page, pageSize } = listQuerySchema.parse(query);
    const { rows, total } = await this.repo.listUsers((page - 1) * pageSize, pageSize);
    const data = rows.map((u) => ({
      id: u.id,
      subject: u.subject,
      email: u.email,
      displayName: u.displayName,
      status: u.status,
      roles: u.roles.map((r) => r.role.key as Role),
      createdAt: u.createdAt.toISOString(),
    }));
    return { data, page, pageSize, total };
  }

  @RequirePermission("identity:assign-role")
  @Post("users/:id/roles")
  @HttpCode(204)
  async assignRole(@Req() req: Request, @Param("id") userId: string, @Body() body: unknown) {
    const { role } = assignRoleSchema.parse(body);
    await this.roleAdmin.assign(actor(req), userId, role, getRequestId(req));
  }

  @RequirePermission("identity:assign-role")
  @Delete("users/:id/roles/:role")
  @HttpCode(204)
  async revokeRole(@Req() req: Request, @Param("id") userId: string, @Param("role") role: string) {
    await this.roleAdmin.revoke(actor(req), userId, role as Role, getRequestId(req));
  }

  @RequirePermission("identity:grant-scope")
  @Post("users/:id/scopes")
  async grantScope(@Req() req: Request, @Param("id") userId: string, @Body() body: unknown) {
    const scope = grantScopeSchema.parse(body);
    const id = await this.scopeAdmin.grant(actor(req), userId, scope, getRequestId(req));
    return { id };
  }

  @RequirePermission("identity:grant-scope")
  @Delete("users/:id/scopes/:scopeId")
  @HttpCode(204)
  async revokeScope(@Req() req: Request, @Param("id") userId: string, @Param("scopeId") scopeId: string) {
    await this.scopeAdmin.revoke(actor(req), userId, scopeId, getRequestId(req));
  }

  @RequirePermission("identity:view-audit")
  @Get("audit")
  async viewAudit(@Query() query: unknown) {
    const { page, pageSize } = listQuerySchema.parse(query);
    const [data, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { occurredAt: "desc" },
      }),
      this.prisma.auditLog.count(),
    ]);
    return { data, page, pageSize, total };
  }
}

function actor(req: Request): string {
  const auth = getAuth(req);
  if (!auth) throw AppError.unauthenticated();
  return auth.userId;
}
