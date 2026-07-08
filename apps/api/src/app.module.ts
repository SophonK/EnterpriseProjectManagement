import { Module, type MiddlewareConsumer, type NestModule } from "@nestjs/common";
import { ConfigModule } from "./foundation/config/config.module.js";
import { LoggingModule } from "./foundation/logging/logging.module.js";
import { DbModule } from "./foundation/db/db.module.js";
import { ErrorsModule } from "./foundation/errors/errors.module.js";
import { EventsModule } from "./foundation/events/events.module.js";
import { AuthModule } from "./foundation/auth/auth.module.js";
import { AuditModule } from "./foundation/audit/audit.module.js";
import { HealthModule } from "./foundation/health/health.module.js";
import { RequestIdMiddleware } from "./foundation/logging/request-id.middleware.js";
import { ProjectExecutionModule } from "./modules/project-execution/project-execution.module.js";

/**
 * Composition root. Foundation modules (config, logging, db, auth, events, audit,
 * health) are registered here first, then domain unit modules as they are built.
 */
@Module({
  imports: [
    ConfigModule,
    LoggingModule,
    DbModule,
    ErrorsModule,
    EventsModule,
    AuditModule,
    AuthModule,
    HealthModule,
    ProjectExecutionModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // Correlation id on every request, before any handler runs.
    consumer.apply(RequestIdMiddleware).forRoutes("*");
  }
}
