import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import { AppModule } from "./app.module.js";
import { ConfigService } from "./foundation/config/config.service.js";

/** API entry point — boots the Modular Monolith host. */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  // Graceful shutdown: run onModuleDestroy hooks (Prisma disconnect) on SIGTERM/SIGINT (REL-4).
  app.enableShutdownHooks();

  // Security baseline: hardened headers, cookie parsing, auth rate limiting (SEC-7).
  app.use(helmet());
  app.use(cookieParser());

  // The web front end is a separate origin; allow it with credentials for cookie auth.
  app.enableCors({ origin: config.get("WEB_ORIGIN"), credentials: true });
  app.use(
    "/auth",
    rateLimit({
      windowMs: 60_000,
      limit: config.get("RATE_LIMIT_AUTH_PER_MIN"),
      standardHeaders: "draft-7",
      legacyHeaders: false,
    }),
  );

  const port = config.get("PORT");
  await app.listen(port);
  console.warn(`[api] listening on :${port} (${config.get("NODE_ENV")})`);
}

void bootstrap();
