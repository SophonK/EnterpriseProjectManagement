import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { loadConfig, REQUIRED_KEYS } from "./config.schema.js";

// A generator for a fully-valid env map (all required keys present + valid).
const validEnvArb = fc.record({
  DATABASE_URL: fc.constantFrom(
    "postgresql://u:p@localhost:5432/db?schema=shared",
    "postgres://a:b@db.example.com:5432/epm",
  ),
  OIDC_ISSUER: fc.constantFrom("https://idp.example.com/", "http://localhost:9000/"),
  OIDC_CLIENT_ID: fc.string({ minLength: 1, maxLength: 40 }),
  OIDC_CLIENT_SECRET: fc.string({ minLength: 1, maxLength: 40 }),
  OIDC_REDIRECT_URI: fc.constantFrom("http://localhost:3000/auth/callback"),
  PORT: fc.integer({ min: 1, max: 65_535 }).map(String),
});

describe("loadConfig (PBT — property P5)", () => {
  it("returns a fully-typed config for any valid env", () => {
    fc.assert(
      fc.property(validEnvArb, (env) => {
        const cfg = loadConfig(env);
        expect(cfg.DATABASE_URL).toBe(env.DATABASE_URL);
        expect(cfg.PORT).toBe(Number(env.PORT));
        // Defaults applied for unspecified keys.
        expect(cfg.NODE_ENV).toBe("development");
        expect(cfg.RATE_LIMIT_AUTH_PER_MIN).toBe(20);
        expect(cfg.WEB_ORIGIN).toBe("http://localhost:5173");
      }),
    );
  });

  it("rejects env missing any required key, naming the offending key", () => {
    fc.assert(
      fc.property(validEnvArb, fc.constantFrom(...REQUIRED_KEYS), (env, dropped) => {
        const broken: Record<string, string | undefined> = { ...env };
        delete broken[dropped];
        expect(() => loadConfig(broken)).toThrowError(new RegExp(dropped));
      }),
    );
  });

  it("rejects a non-URL DATABASE_URL", () => {
    expect(() => loadConfig({ ...validExample(), DATABASE_URL: "not-a-url" })).toThrow();
  });
});

function validExample(): Record<string, string> {
  return {
    DATABASE_URL: "postgresql://u:p@localhost:5432/db?schema=shared",
    OIDC_ISSUER: "https://idp.example.com/",
    OIDC_CLIENT_ID: "epm",
    OIDC_CLIENT_SECRET: "secret",
    OIDC_REDIRECT_URI: "http://localhost:3000/auth/callback",
  };
}
