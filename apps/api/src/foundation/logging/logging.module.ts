import { Global, Module } from "@nestjs/common";
import { ConfigService } from "../config/config.service.js";
import { LOGGER, createLogger } from "./logger.js";
import { RequestIdMiddleware } from "./request-id.middleware.js";

/** Global logging module — provides the pino logger and the request-id middleware. */
@Global()
@Module({
  providers: [
    {
      provide: LOGGER,
      useFactory: (config: ConfigService) => createLogger(config.get("LOG_LEVEL")),
      inject: [ConfigService],
    },
    RequestIdMiddleware,
  ],
  exports: [LOGGER, RequestIdMiddleware],
})
export class LoggingModule {}
