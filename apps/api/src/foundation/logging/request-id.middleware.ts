import { Injectable, type NestMiddleware } from "@nestjs/common";
import type { Request, Response, NextFunction } from "express";
import { randomUUID } from "node:crypto";
import { REQUEST_ID_HEADER } from "./request-context.js";

/**
 * Assigns a correlation id to every request: reuses an inbound X-Request-Id when
 * present, otherwise generates one. Echoes it on the response (OBS-1).
 */
@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const inbound = req.header(REQUEST_ID_HEADER);
    const id = inbound && inbound.length > 0 ? inbound : randomUUID();
    req.requestId = id;
    res.setHeader("X-Request-Id", id);
    next();
  }
}
