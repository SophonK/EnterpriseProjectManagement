import { Global, Module } from "@nestjs/common";
import { ConfigService } from "./config.service.js";

/** Global config module — ConfigService is injectable everywhere without re-importing. */
@Global()
@Module({
  providers: [ConfigService],
  exports: [ConfigService],
})
export class ConfigModule {}
