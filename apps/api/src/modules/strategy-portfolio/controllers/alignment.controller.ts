import { Controller, Get, Req } from "@nestjs/common";
import type { Request } from "express";
import type { UnalignedReportDTO } from "@epm/shared";
import { RequirePermission } from "../../../foundation/auth/decorators.js";
import { getAuth } from "../../../foundation/logging/request-context.js";
import { AlignmentService } from "../services/alignment.service.js";

@Controller("api/v1/strategy/alignment")
export class AlignmentController {
  constructor(private readonly alignmentService: AlignmentService) {}

  // Director-only (US-010). Empty result → { items: [], fullyAligned: true }.
  @Get("unaligned")
  @RequirePermission("alignment:read")
  async listUnaligned(@Req() req: Request): Promise<UnalignedReportDTO> {
    return this.alignmentService.listUnaligned(getAuth(req)!);
  }
}
