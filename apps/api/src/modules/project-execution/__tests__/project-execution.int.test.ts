/**
 * Integration tests for project-execution unit (tasks 8.1–8.6).
 * Requires Docker — each test guards with `if (!dockerAvailable) return ctx.skip()`.
 *
 * Run with:
 *   pnpm --filter @epm/api vitest run --config vitest.int.config.ts
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { Test } from "@nestjs/testing";
import * as request from "supertest";
import type { INestApplication } from "@nestjs/common";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { AppModule } from "../../../app.module.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DB_PKG_ROOT = join(process.cwd(), "..", "..", "packages", "db");

let dockerAvailable = true;
let container: StartedPostgreSqlContainer | undefined;
let app: INestApplication | undefined;
let httpServer: ReturnType<INestApplication["getHttpServer"]>;

// Synthetic JWT token generator — we mock TokenVerifier to accept any Bearer token
// and decode the roles from its sub/claims payload we pass as JSON in the token header.
// This avoids running a real OIDC issuer in tests.
function makeFakeJwt(ctx: { userId: string; roles: string[] }): string {
  // Format: "fake.<base64(ctx)>" — recognized by the test TokenVerifier mock
  return `fake.${Buffer.from(JSON.stringify(ctx)).toString("base64")}`;
}

const DIRECTOR_TOKEN   = makeFakeJwt({ userId: "user-director",  roles: ["EPMO_DIRECTOR"] });
const PM_A_TOKEN       = makeFakeJwt({ userId: "user-pm-a",      roles: ["PROJECT_MANAGER"] });
const PM_B_TOKEN       = makeFakeJwt({ userId: "user-pm-b",      roles: ["PROJECT_MANAGER"] });
const _PORT_MGR_TOKEN  = makeFakeJwt({ userId: "user-port-mgr",  roles: ["PORTFOLIO_MANAGER"] });

const TEST_PORTFOLIO_ID = randomUUID();
const TEST_PROGRAM_ID   = randomUUID();

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

beforeAll(async () => {
  try {
    container = await new PostgreSqlContainer("postgres:16-alpine").start();
  } catch (err) {
    dockerAvailable = false;
    console.warn("[project-execution.int] Docker unavailable — skipping:", err);
    return;
  }

  const dbUrl = container.getConnectionUri();

  // Apply all migrations
  execFileSync("prisma", ["migrate", "deploy"], {
    cwd: DB_PKG_ROOT,
    env: { ...process.env, DATABASE_URL: dbUrl },
    stdio: "inherit",
    shell: true,
  });

  // Bootstrap NestJS with DATABASE_URL pointing to test container
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider("ConfigService")
    .useFactory({
      factory: () => ({
        get: (key: string) => {
          if (key === "DATABASE_URL") return dbUrl;
          if (key === "OIDC_ISSUER") return "https://test.example.com";
          if (key === "OIDC_AUDIENCE") return "epm-api";
          return undefined;
        },
      }),
    })
    // Mock TokenVerifier to decode our fake JWT without real OIDC
    .overrideProvider("TOKEN_VERIFIER")
    .useValue({
      verify: (token: string) => {
        if (!token.startsWith("fake.")) throw new Error("Unauthorized");
        const payload = JSON.parse(Buffer.from(token.slice(5), "base64").toString());
        return Promise.resolve({
          userId:       payload.userId,
          roles:        payload.roles,
          recordScopes: [],
        });
      },
    })
    .compile();

  app = moduleRef.createNestApplication();
  await app.init();
  httpServer = app.getHttpServer();
}, 60_000);

afterAll(async () => {
  await app?.close();
  await container?.stop();
});

// ---------------------------------------------------------------------------
// Helper — auth header
// ---------------------------------------------------------------------------

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

// ---------------------------------------------------------------------------
// 8.1 — Full CRUD cycle
// ---------------------------------------------------------------------------

describe("8.1 — CRUD cycle: create project → add milestone → update status → retrieve", () => {
  let projectId: string;
  let _milestoneId: string;

  it("creates a project (POST /api/v1/projects)", async (ctx) => {
    if (!dockerAvailable) return ctx.skip();

    const res = await request(httpServer)
      .post("/api/v1/projects")
      .set(auth(PM_A_TOKEN))
      .send({
        name:         "Integration Test Project",
        portfolioId:  TEST_PORTFOLIO_ID,
        programId:    TEST_PROGRAM_ID,
        plannedStart: "2026-09-01",
        plannedEnd:   "2027-03-31",
      });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      name:        "Integration Test Project",
      portfolioId: TEST_PORTFOLIO_ID,
      status:      "Open",
      health:      "OnTrack",
    });
    projectId = res.body.id as string;
  });

  it("retrieves the project (GET /api/v1/projects/:id)", async (ctx) => {
    if (!dockerAvailable || !projectId) return ctx.skip();

    const res = await request(httpServer)
      .get(`/api/v1/projects/${projectId}`)
      .set(auth(PM_A_TOKEN));

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(projectId);
  });

  it("adds a milestone (POST /api/v1/projects/:id/milestones)", async (ctx) => {
    if (!dockerAvailable || !projectId) return ctx.skip();

    const res = await request(httpServer)
      .post(`/api/v1/projects/${projectId}/milestones`)
      .set(auth(PM_A_TOKEN))
      .send({ title: "Alpha Release", dueDate: "2026-12-15" });

    expect(res.status).toBe(201);
    expect(res.body.title).toBe("Alpha Release");
    _milestoneId = res.body.id as string;
  });

  it("updates project status Open → Active (POST /api/v1/projects/:id/status)", async (ctx) => {
    if (!dockerAvailable || !projectId) return ctx.skip();

    const res = await request(httpServer)
      .post(`/api/v1/projects/${projectId}/status`)
      .set(auth(PM_A_TOKEN))
      .send({ status: "Active", health: "OnTrack", note: "Kickoff done" });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe("Active");
  });

  it("retrieves status history (GET /api/v1/projects/:id/status)", async (ctx) => {
    if (!dockerAvailable || !projectId) return ctx.skip();

    const res = await request(httpServer)
      .get(`/api/v1/projects/${projectId}/status`)
      .set(auth(PM_A_TOKEN));

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// 8.2 — Roll-up recomputed after status change
// ---------------------------------------------------------------------------

describe("8.2 — Roll-up recomputation after status change", () => {
  it("rollup_snapshot is present after status change (GET /api/v1/portfolios/:id/rollup)", async (ctx) => {
    if (!dockerAvailable) return ctx.skip();

    const res = await request(httpServer)
      .get(`/api/v1/portfolios/${TEST_PORTFOLIO_ID}/rollup`)
      .set(auth(DIRECTOR_TOKEN));

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      portfolioId: TEST_PORTFOLIO_ID,
      totalCount:  expect.any(Number),
    });
  });
});

// ---------------------------------------------------------------------------
// 8.3 — Record-scope filter: PM cannot see another PM's projects
// ---------------------------------------------------------------------------

describe("8.3 — Record-scope: PM A cannot see PM B's projects", () => {
  let pmBProjectId: string;

  it("PM B creates a project", async (ctx) => {
    if (!dockerAvailable) return ctx.skip();

    const res = await request(httpServer)
      .post("/api/v1/projects")
      .set(auth(PM_B_TOKEN))
      .send({
        name:         "PM B Exclusive Project",
        portfolioId:  randomUUID(), // different portfolio
        plannedStart: "2026-10-01",
        plannedEnd:   "2027-06-30",
      });

    expect(res.status).toBe(201);
    pmBProjectId = res.body.id as string;
  });

  it("PM A list does NOT include PM B's project", async (ctx) => {
    if (!dockerAvailable || !pmBProjectId) return ctx.skip();

    const res = await request(httpServer)
      .get("/api/v1/projects")
      .set(auth(PM_A_TOKEN));

    expect(res.status).toBe(200);
    const ids = (res.body.data as { id: string }[]).map((p) => p.id);
    expect(ids).not.toContain(pmBProjectId);
  });

  it("EPMO Director list includes PM B's project", async (ctx) => {
    if (!dockerAvailable || !pmBProjectId) return ctx.skip();

    const res = await request(httpServer)
      .get("/api/v1/projects")
      .set(auth(DIRECTOR_TOKEN));

    expect(res.status).toBe(200);
    const ids = (res.body.data as { id: string }[]).map((p) => p.id);
    expect(ids).toContain(pmBProjectId);
  });
});

// ---------------------------------------------------------------------------
// 8.4 — DemandPromoted idempotency
// ---------------------------------------------------------------------------

describe("8.4 — DemandPromoted event idempotency", () => {
  it("replaying the same demand event does not create a duplicate project", async (ctx) => {
    if (!dockerAvailable) return ctx.skip();

    const demandId = randomUUID();
    const portfolioId = randomUUID();

    // First creation via service (simulates event handler)
    const res1 = await request(httpServer)
      .post("/api/v1/projects")
      .set(auth(DIRECTOR_TOKEN))
      .send({
        name:           `Demand Project ${demandId.slice(0, 8)}`,
        portfolioId,
        plannedStart:   "2026-11-01",
        plannedEnd:     "2027-08-31",
        sourceDemandId: demandId,
      });

    expect(res1.status).toBe(201);
    const firstId = res1.body.id as string;

    // Second create with same sourceDemandId — must return same project
    const res2 = await request(httpServer)
      .post("/api/v1/projects")
      .set(auth(DIRECTOR_TOKEN))
      .send({
        name:           `Demand Project ${demandId.slice(0, 8)}`,
        portfolioId,
        plannedStart:   "2026-11-01",
        plannedEnd:     "2027-08-31",
        sourceDemandId: demandId,
      });

    expect(res2.status).toBe(201);
    expect(res2.body.id).toBe(firstId); // same project returned
  });
});

// ---------------------------------------------------------------------------
// 8.5 — Audit trail
// ---------------------------------------------------------------------------

describe("8.5 — Audit trail written on mutations", () => {
  it("audit_log row exists after project creation", async (ctx) => {
    if (!dockerAvailable) return ctx.skip();

    const res = await request(httpServer)
      .post("/api/v1/projects")
      .set(auth(PM_A_TOKEN))
      .send({
        name:         "Audit Trail Test Project",
        portfolioId:  randomUUID(),
        plannedStart: "2026-09-15",
        plannedEnd:   "2027-05-01",
      });

    expect(res.status).toBe(201);
    const projectId = res.body.id as string;

    // Query audit log directly via Prisma (NestJS app has PrismaService in its container)
    const prismaService = app!.get("PrismaService");
    const auditRows = await prismaService.auditLog.findMany({
      where: { entityType: "project", entityId: projectId },
    });

    expect(auditRows.length).toBeGreaterThanOrEqual(1);
    expect(auditRows[0].action).toBe("create");
  });
});

// ---------------------------------------------------------------------------
// 8.6 — GET /health passes with ProjectExecutionModule registered
// ---------------------------------------------------------------------------

describe("8.6 — Health check passes with ProjectExecutionModule", () => {
  it("GET /health returns 200", async (ctx) => {
    if (!dockerAvailable) return ctx.skip();

    const res = await request(httpServer).get("/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
  });
});
