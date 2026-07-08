import pino, { type Logger } from "pino";

export type AppLogger = Logger;

/** DI token for the shared pino logger. */
export const LOGGER = Symbol("LOGGER");

/**
 * Structured JSON logger. Secrets/tokens are redacted so they never reach logs
 * (security-baseline SEC-4). Timestamps are ISO 8601 UTC.
 */
export function createLogger(level: string): AppLogger {
  return pino({
    level,
    redact: {
      paths: [
        "req.headers.authorization",
        "req.headers.cookie",
        "*.password",
        "*.secret",
        "*.token",
        "OIDC_CLIENT_SECRET",
      ],
      censor: "[redacted]",
    },
    formatters: {
      level: (label) => ({ level: label }),
    },
    timestamp: pino.stdTimeFunctions.isoTime,
  });
}
