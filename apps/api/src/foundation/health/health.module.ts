import { Module } from "@nestjs/common";
import { HealthController } from "./health.controller.js";

/** Health module — exposes the public /health probe. */
@Module({
  controllers: [HealthController],
})
export class HealthModule {}
