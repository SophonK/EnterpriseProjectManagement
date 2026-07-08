import { Global, Module } from "@nestjs/common";
import { AUTH_CONTEXT_ENRICHER } from "../../foundation/auth/auth-context-enricher.js";
import { IdentityRepository } from "./identity.repository.js";
import { UserDirectoryService } from "./user-directory.service.js";
import { IdentityAuthEnricher } from "./identity-auth-enricher.js";
import { RbacBootstrapService } from "./rbac-bootstrap.service.js";
import { UserProvisioningService } from "./user-provisioning.service.js";
import { RoleAdminService, ScopeAdminService } from "./admin.services.js";
import { IdentityAdminController } from "./identity-admin.controller.js";

/**
 * identity-access unit. @Global so the AUTH_CONTEXT_ENRICHER binding is visible to
 * the foundation TokenVerifier (DB-driven authz).
 */
@Global()
@Module({
  controllers: [IdentityAdminController],
  providers: [
    IdentityRepository,
    UserDirectoryService,
    IdentityAuthEnricher,
    { provide: AUTH_CONTEXT_ENRICHER, useExisting: IdentityAuthEnricher },
    RbacBootstrapService,
    UserProvisioningService,
    RoleAdminService,
    ScopeAdminService,
  ],
  exports: [AUTH_CONTEXT_ENRICHER, IdentityRepository, UserDirectoryService],
})
export class IdentityAccessModule {}
