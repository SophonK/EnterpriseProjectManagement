import type { PipeTransform } from "@nestjs/common";
import type { ZodSchema, ZodError } from "zod";
import { AppError } from "@epm/shared";

export class ZodValidationPipe<T> implements PipeTransform {
  constructor(
    private readonly schema: ZodSchema<T>,
    private readonly errorCode: string = "EXECUTION_001",
  ) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      const errors = (result.error as ZodError).errors.map(
        (e) => `${e.path.join(".")}: ${e.message}`,
      );
      throw new AppError(this.errorCode, errors.join("; "));
    }
    return result.data;
  }
}
