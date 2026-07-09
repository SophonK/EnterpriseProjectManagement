import { Global, Module } from "@nestjs/common";
import { ConfigService } from "./config.service.js";

/** Global config module — ConfigService is injectable everywhere without re-importing. */
@Global()
@Module({
  // ConfigService's constructor takes `env` with a default of `process.env`. Nest DI ignores
  // default param values and would try to inject `env` (erased to `Object` at runtime) — which
  // no provider supplies, failing app bootstrap. Construct it explicitly via a factory so DI
  // never resolves that arg, while keeping the constructor overridable for unit tests.
  providers: [{ provide: ConfigService, useFactory: (): ConfigService => new ConfigService(process.env) }],
  exports: [ConfigService],
})
export class ConfigModule {}
