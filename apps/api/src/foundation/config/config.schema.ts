import { z } from "zod";
import { AppError } from "@epm/shared";

/** Environment schema — the single source of truth for runtime config. */
export const configSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "staging", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),

  // Required — no defaults; missing/invalid => fail fast at boot.
  DATABASE_URL: z.string().url(),
  OIDC_ISSUER: z.string().url(),
  OIDC_CLIENT_ID: z.string().min(1),
  OIDC_CLIENT_SECRET: z.string().min(1),
  OIDC_REDIRECT_URI: z.string().url(),

  OIDC_SCOPES: z.string().min(1).default("openid profile email roles"),
  RATE_LIMIT_AUTH_PER_MIN: z.coerce.number().int().positive().default(20),

  // Allowed browser origin for the separate web front end (CORS + credentials).
  WEB_ORIGIN: z.string().url().default("http://localhost:5173"),
});

export type AppConfig = z.infer<typeof configSchema>;

/** Keys that have no default and must be supplied. */
export const REQUIRED_KEYS = [
  "DATABASE_URL",
  "OIDC_ISSUER",
  "OIDC_CLIENT_ID",
  "OIDC_CLIENT_SECRET",
  "OIDC_REDIRECT_URI",
] as const;

/**
 * Parse + validate an env map into a typed config.
 * Throws AppError(VALIDATION_001) listing every offending key — never returns a partial config.
 */
export function loadConfig(env: Record<string, string | undefined>): AppConfig {
  const result = configSchema.safeParse(env);
  if (!result.success) {
    const keys = result.error.issues.map((i) => i.path.join(".")).join(", ");
    throw AppError.validation(`invalid configuration: ${keys}`);
  }
  return result.data;
}
