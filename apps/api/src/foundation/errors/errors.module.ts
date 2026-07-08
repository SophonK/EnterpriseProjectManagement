import { Module } from "@nestjs/common";
import { APP_FILTER } from "@nestjs/core";
import { ProblemDetailsFilter } from "./problem-details.filter.js";

/** Registers the RFC 7807 filter as the global exception filter. */
@Module({
  providers: [{ provide: APP_FILTER, useClass: ProblemDetailsFilter }],
})
export class ErrorsModule {}
