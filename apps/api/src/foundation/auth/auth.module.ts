import { Global, Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { RbacRegistry } from "./rbac.registry.js";
import { TokenVerifier } from "./token-verifier.js";
import { OidcService } from "./oidc.service.js";
import { AuthController } from "./auth.controller.js";
import { AuthGuard } from "./auth.guard.js";

/**
 * Global auth module — OIDC flow (controller/service), JWT verification, RBAC
 * registry, and the global AuthGuard. Units import nothing extra: they inject
 * RbacRegistry to declare grants and use @RequirePermission / @Public on routes.
 */
@Global()
@Module({
  controllers: [AuthController],
  providers: [
    RbacRegistry,
    TokenVerifier,
    OidcService,
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
  exports: [RbacRegistry, TokenVerifier],
})
export class AuthModule {}
