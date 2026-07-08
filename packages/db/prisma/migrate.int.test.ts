import { describe, it, beforeAll, afterAll, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { PrismaClient } from "@prisma/client";

// Integration test: apply the real migration to a throwaway Postgres and assert the
// schema-per-unit layout + shared tables exist. Skips gracefully when Docker is absent.

const here = dirname(fileURLToPath(import.meta.url));
const dbPackageRoot = resolve(here, "..");

let container: StartedPostgreSqlContainer | undefined;
let prisma: PrismaClient | undefined;
let dockerAvailable = true;

beforeAll(async () => {
  try {
    container = await new PostgreSqlContainer("postgres:16-alpine").start();
  } catch (err) {
    // No Docker daemon (e.g., CI without docker-in-docker, or a dev box without Docker).
    dockerAvailable = false;
    console.warn("[migrate.int] Docker unavailable — skipping migration integration test:", err);
    return;
  }
  const url = container.getConnectionUri();
  // Apply the committed migrations exactly as production would.
  execFileSync("prisma", ["migrate", "deploy"], {
    cwd: dbPackageRoot,
    env: { ...process.env, DATABASE_URL: url },
    stdio: "inherit",
    shell: true,
  });
  prisma = new PrismaClient({ datasources: { db: { url } } });
});

afterAll(async () => {
  await prisma?.$disconnect();
  await container?.stop();
});

describe("migration integration (Testcontainers Postgres)", () => {
  it("creates all 8 unit schemas", async (ctx) => {
    if (!dockerAvailable || !prisma) return ctx.skip();
    const rows = await prisma.$queryRawUnsafe<{ schema_name: string }[]>(
      `SELECT schema_name FROM information_schema.schemata
       WHERE schema_name IN ('identity','strategy','execution','resource','risk','intake','reporting','shared')`,
    );
    expect(rows.map((r) => r.schema_name).sort()).toEqual(
      ["execution", "identity", "intake", "reporting", "resource", "risk", "shared", "strategy"],
    );
  });

  it("creates the shared cross-cutting tables", async (ctx) => {
    if (!dockerAvailable || !prisma) return ctx.skip();
    const rows = await prisma.$queryRawUnsafe<{ table_name: string }[]>(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'shared'`,
    );
    const names = rows.map((r) => r.table_name).sort();
    expect(names).toEqual(["audit_log", "outbox", "processed_events"]);
  });
});
