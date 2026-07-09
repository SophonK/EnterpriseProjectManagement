/**
 * Shared helper for integration tests.
 *
 * Priority:
 *   1. TEST_DATABASE_URL env var — use existing local Postgres (no Docker needed)
 *   2. Testcontainers — spin up a fresh postgres:16-alpine container
 *   3. Neither available — return { unavailable: true }; tests should skip themselves
 *
 * Usage in beforeAll:
 *   const result = await resolveTestDb("[suite-name]");
 *   if ("unavailable" in result) { available = false; return; }
 *   testDb = result;
 *   // use result.dbUrl to configure the NestJS app
 *
 * Usage in afterAll:
 *   if (testDb) await teardownTestDb(testDb, prismaService);
 */
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import type { StartedPostgreSqlContainer } from "@testcontainers/postgresql";

const DB_PKG_ROOT = join(process.cwd(), "..", "..", "packages", "db");

// All schemas managed by Prisma migrations (in dependency order for TRUNCATE CASCADE)
const APP_SCHEMAS = ["shared", "identity", "strategy", "execution", "intake", "resource", "risk"] as const;

export interface TestDbReady {
  dbUrl: string;
  /** Present only when using Testcontainers */
  container?: StartedPostgreSqlContainer;
  /** true when using TEST_DATABASE_URL (pre-existing local Postgres) */
  local: boolean;
}

export interface TestDbUnavailable {
  unavailable: true;
}

function runMigrations(dbUrl: string): void {
  execFileSync("prisma", ["migrate", "deploy"], {
    cwd: DB_PKG_ROOT,
    env: { ...process.env, DATABASE_URL: dbUrl },
    stdio: "inherit",
    shell: true,
  });
}

export async function resolveTestDb(suiteName: string): Promise<TestDbReady | TestDbUnavailable> {
  // 1. Local Postgres via env var
  const localUrl = process.env.TEST_DATABASE_URL;
  if (localUrl) {
    try {
      console.info(`[${suiteName}.int] Using local Postgres: TEST_DATABASE_URL`);
      runMigrations(localUrl);
      return { dbUrl: localUrl, local: true };
    } catch (err) {
      console.warn(
        `[${suiteName}.int] TEST_DATABASE_URL set but DB unreachable — falling back to Testcontainers:`,
        (err as Error).message,
      );
    }
  }

  // 2. Testcontainers
  try {
    const { PostgreSqlContainer } = await import("@testcontainers/postgresql");
    const container = await new PostgreSqlContainer("postgres:16-alpine").start();
    const dbUrl = container.getConnectionUri();
    runMigrations(dbUrl);
    return { dbUrl, container, local: false };
  } catch (err) {
    console.warn(
      `[${suiteName}.int] Neither TEST_DATABASE_URL nor Docker available — skipping:`,
      err,
    );
    return { unavailable: true };
  }
}

/**
 * Teardown: stop Testcontainers container or truncate all tables on a local DB.
 * Pass the PrismaService instance so we can run raw SQL for truncation.
 */
export async function teardownTestDb(
  result: TestDbReady,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  prisma?: any,
): Promise<void> {
  if (result.container) {
    await result.container.stop();
    return;
  }

  // Local DB — truncate all app tables so the next test file starts clean
  if (prisma) {
    const schemaList = APP_SCHEMAS.map((s) => `'${s}'`).join(", ");
    await prisma.$executeRawUnsafe(`
      DO $$ DECLARE r RECORD; BEGIN
        FOR r IN (
          SELECT schemaname, tablename FROM pg_tables
          WHERE schemaname IN (${schemaList})
        ) LOOP
          EXECUTE format('TRUNCATE TABLE %I.%I CASCADE', r.schemaname, r.tablename);
        END LOOP;
      END $$;
    `);
  }
}
