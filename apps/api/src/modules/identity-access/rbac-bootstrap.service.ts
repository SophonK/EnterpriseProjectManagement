import { Inject, Injectable, type OnModuleInit } from "@nestjs/common";
import type { Permission, Role } from "@epm/shared";
import { RbacRegistry } from "../../foundation/auth/rbac.registry.js";
import { LOGGER, type AppLogger } from "../../foundation/logging/logger.js";
import { IdentityRepository } from "./identity.repository.js";

/** Loads DB role→permission grants into the in-memory RbacRegistry at boot (IA-REL-1). */
@Injectable()
export class RbacBootstrapService implements OnModuleInit {
  constructor(
    private readonly repo: IdentityRepository,
    private readonly rbac: RbacRegistry,
    @Inject(LOGGER) private readonly logger: AppLogger,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      const grants = await this.repo.allRolePermissions();
      for (const g of grants) {
        this.rbac.grant(g.role as Role, g.permission as Permission);
      }
      this.logger.info({ count: grants.length }, "RBAC registry loaded from identity DB");
    } catch (err) {
      // DB unavailable at boot — log; a later reload can populate the registry.
      this.logger.error({ err }, "RBAC bootstrap failed; registry not loaded");
    }
  }
}
