/**
 * Integration tests for the demand-intake unit (tasks 8.1–8.6).
 * Requires Docker — each test guards with `if (!dockerAvailable) return ctx.skip()`.
 *
 * Run with:
 *   pnpm --filter @epm/api vitest run --config vitest.int.config.ts
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { Test } from "@nestjs/testing";
import * as request from "supertest";
import type { INestApplication } from "@nestjs/common";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import {
  DEMAND_INTAKE_EVENTS,
  type DemandPromotedPayload,
  type DomainEvent,
} from "@epm/shared";
import { AppModule } from "../../../app.module.js";
import { EVENT_BUS, type EventBus } from "../../../foundation/events/event-bus.js";
import { PrismaService } from "../../../foundation/db/prisma.service.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DB_PKG_ROOT = join(process.cwd(), "..", "..", "packages", "db");

let dockerAvailable = true;
let container: StartedPostgreSqlContainer | undefined;
let app: INestApplication | undefined;
let httpServer: ReturnType<INestApplication["getHttpServer"]>;
let eventBus: EventBus;
let prisma: PrismaService;

/** Captured `demand-intake.demand.promoted` deliveries (task 8.5). */
const promotedEvents: DomainEvent<DemandPromotedPayload>[] = [];

function makeFakeJwt(ctx: { userId: string; roles: string[] }): string {
  return `fake.${Buffer.from(JSON.stringify(ctx)).toString("base64")}`;
}

const DIRECTOR_TOKEN = makeFakeJwt({ userId: "user-director", roles: ["EPMO_DIRECTOR"] });
const PM_A_TOKEN     = makeFakeJwt({ userId: "user-pm-a",     roles: ["PORTFOLIO_MANAGER"] });
const PM_B_TOKEN     = makeFakeJwt({ userId: "user-pm-b",     roles: ["PORTFOLIO_MANAGER"] });

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

beforeAll(async () => {
  try {
    container = await new PostgreSqlContainer("postgres:16-alpine").start();
  } catch (err) {
    dockerAvailable = false;
    console.warn("[demand-intake.int] Docker unavailable — skipping:", err);
    return;
  }

  const dbUrl = container.getConnectionUri();

  execFileSync("prisma", ["migrate", "deploy"], {
    cwd: DB_PKG_ROOT,
    env: { ...process.env, DATABASE_URL: dbUrl },
    stdio: "inherit",
    shell: true,
  });

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
  eventBus = app.get<EventBus>(EVENT_BUS);
  prisma = app.get(PrismaService);

  // Record promoted events for the exact-payload assertion (task 8.5).
  eventBus.subscribe<DemandPromotedPayload>(
    DEMAND_INTAKE_EVENTS.DEMAND_PROMOTED,
    async (event) => {
      promotedEvents.push(event);
    },
  );
}, 120_000);

afterAll(async () => {
  await app?.close();
  await container?.stop();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

async function submitRequest(token: string, title: string): Promise<string> {
  const res = await request(httpServer)
    .post("/api/v1/intake/requests")
    .set(auth(token))
    .send({
      title,
      sponsor: "VP Customer Success",
      description: "Reduce inbound support volume with a self-service portal",
      expectedValue: 750000,
    });
  expect(res.status).toBe(201);
  return res.body.id as string;
}

async function advance(token: string, id: string) {
  return request(httpServer)
    .post(`/api/v1/intake/requests/${id}/advance`)
    .set(auth(token))
    .send({});
}

// ---------------------------------------------------------------------------
// 8.1 — submit → persisted Submitted; missing field → DEMAND_001
// ---------------------------------------------------------------------------

describe("8.1 — submit intake request (US-029)", () => {
  it("Portfolio Manager submits a request; persisted with status = Submitted (201)", async (ctx) => {
    if (!dockerAvailable) return ctx.skip();

    const res = await request(httpServer)
      .post("/api/v1/intake/requests")
      .set(auth(PM_A_TOKEN))
      .send({
        title: "Customer Self-Service Portal",
        sponsor: "VP Customer Success",
        description: "Reduce inbound support volume with a self-service portal",
        expectedValue: 750000,
      });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      title: "Customer Self-Service Portal",
      status: "Submitted",
      currentGate: "Submitted",
      submittedBy: "user-pm-a",
    });
  });

  it("rejects a submit missing a required field with DEMAND_001 (400)", async (ctx) => {
    if (!dockerAvailable) return ctx.skip();

    const res = await request(httpServer)
      .post("/api/v1/intake/requests")
      .set(auth(PM_A_TOKEN))
      .send({ title: "Incomplete", sponsor: "VP" }); // missing description

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("DEMAND_001");
  });
});

// ---------------------------------------------------------------------------
// 8.2 — configure scoring model → score → weighted total + ranked
// ---------------------------------------------------------------------------

describe("8.2 — configurable scoring + ranking (US-030)", () => {
  it("Director configures an active model; PM scores a screening request; ranked list reflects it", async (ctx) => {
    if (!dockerAvailable) return ctx.skip();

    // Director activates a scoring model (single-active, 201).
    const model = await request(httpServer)
      .post("/api/v1/intake/scoring-models")
      .set(auth(DIRECTOR_TOKEN))
      .send({
        name: "FY26 Intake Scoring",
        criteria: [
          { name: "Strategic Fit", weight: 3, maxScore: 100 },
          { name: "Expected ROI", weight: 2, maxScore: 100 },
          { name: "Delivery Risk", weight: 1, maxScore: 100 },
        ],
      });

    expect(model.status).toBe(201);
    expect(model.body.isActive).toBe(true);
    const criteria = model.body.criteria as { id: string }[];
    expect(criteria).toHaveLength(3);

    // A PM cannot configure a scoring model (Director-only) → 403.
    const forbidden = await request(httpServer)
      .post("/api/v1/intake/scoring-models")
      .set(auth(PM_A_TOKEN))
      .send({ name: "X", criteria: [{ name: "c", weight: 1 }] });
    expect(forbidden.status).toBe(403);

    // Active model is readable.
    const active = await request(httpServer)
      .get("/api/v1/intake/scoring-models/active")
      .set(auth(PM_A_TOKEN));
    expect(active.status).toBe(200);
    expect(active.body.name).toBe("FY26 Intake Scoring");

    // Submit + advance to Screening so the request is scorable.
    const id = await submitRequest(PM_A_TOKEN, "Scored Portal");
    const toScreening = await advance(PM_A_TOKEN, id);
    expect(toScreening.status).toBe(200);
    expect(toScreening.body.status).toBe("Screening");

    // Score: (3*0.9 + 2*0.7 + 1*0.4) / 6 * 100 = 75.
    const score = await request(httpServer)
      .post(`/api/v1/intake/requests/${id}/score`)
      .set(auth(PM_A_TOKEN))
      .send({
        scores: [
          { criterionId: criteria[0]!.id, rawScore: 90 },
          { criterionId: criteria[1]!.id, rawScore: 70 },
          { criterionId: criteria[2]!.id, rawScore: 40 },
        ],
      });

    expect(score.status).toBe(200);
    expect(score.body.weightedTotal).toBeGreaterThanOrEqual(0);
    expect(score.body.weightedTotal).toBeLessThanOrEqual(100);
    expect(score.body.weightedTotal).toBeCloseTo(75, 5);

    // Ranked list (Director sees all) includes the scored request.
    const ranked = await request(httpServer)
      .get("/api/v1/intake/requests/ranked")
      .set(auth(DIRECTOR_TOKEN));
    expect(ranked.status).toBe(200);
    const row = (ranked.body as { demandRequestId: string; rank: number; weightedTotal: number }[]).find(
      (r) => r.demandRequestId === id,
    );
    expect(row).toBeDefined();
    expect(row!.rank).toBeGreaterThanOrEqual(1);
    expect(row!.weightedTotal).toBeCloseTo(75, 5);
  });
});

// ---------------------------------------------------------------------------
// 8.3 — advance with permission; missing gate permission → 403; illegal → DEMAND_005
// ---------------------------------------------------------------------------

describe("8.3 — stage-gate advance + per-gate RBAC (US-031)", () => {
  it("advances through gates, refuses the approval gate to PM (403), then Director approves; illegal advance → DEMAND_005", async (ctx) => {
    if (!dockerAvailable) return ctx.skip();

    const id = await submitRequest(PM_A_TOKEN, "Gated Portal");

    // Submitted → Screening (PM holds intake-gate:screening).
    const s = await advance(PM_A_TOKEN, id);
    expect(s.status).toBe(200);
    expect(s.body.status).toBe("Screening");

    // Screening → Evaluation (PM holds intake-gate:evaluation).
    const e = await advance(PM_A_TOKEN, id);
    expect(e.status).toBe(200);
    expect(e.body.status).toBe("Evaluation");

    // Evaluation → Approved as PM → 403 (PM lacks the intake-gate:approval per-gate permission).
    const pmApprove = await advance(PM_A_TOKEN, id);
    expect(pmApprove.status).toBe(403);

    // The request must not have mutated on the refused advance.
    const stillEval = await request(httpServer)
      .get(`/api/v1/intake/requests/${id}`)
      .set(auth(DIRECTOR_TOKEN));
    expect(stillEval.body.status).toBe("Evaluation");

    // Director completes the final approval gate.
    const approved = await advance(DIRECTOR_TOKEN, id);
    expect(approved.status).toBe(200);
    expect(approved.body.status).toBe("Approved");

    // Illegal advance from Approved (no successor gate) → DEMAND_005 (409).
    const illegal = await advance(DIRECTOR_TOKEN, id);
    expect(illegal.status).toBe(409);
    expect(illegal.body.code).toBe("DEMAND_005");
  });
});

// ---------------------------------------------------------------------------
// 8.4 — reject → Rejected + reason (terminal)
// ---------------------------------------------------------------------------

describe("8.4 — reject a request (US-031)", () => {
  it("rejects at an active gate with a reason (terminal); a further advance → DEMAND_005", async (ctx) => {
    if (!dockerAvailable) return ctx.skip();

    const id = await submitRequest(PM_A_TOKEN, "Rejected Portal");
    await advance(PM_A_TOKEN, id); // → Screening

    const reject = await request(httpServer)
      .post(`/api/v1/intake/requests/${id}/reject`)
      .set(auth(PM_A_TOKEN))
      .send({ reason: "Insufficient strategic alignment for this cycle" });

    expect(reject.status).toBe(200);
    expect(reject.body.status).toBe("Rejected");
    expect(reject.body.rejectionReason).toBe("Insufficient strategic alignment for this cycle");

    // Rejected is terminal — advancing again is illegal (409 DEMAND_005).
    const illegal = await advance(PM_A_TOKEN, id);
    expect(illegal.status).toBe(409);
    expect(illegal.body.code).toBe("DEMAND_005");
  });
});

// ---------------------------------------------------------------------------
// 8.5 — promote Approved → demand.promoted (exact payload) + Promoted; re-promote → DEMAND_006
// ---------------------------------------------------------------------------

describe("8.5 — promote to project (US-032)", () => {
  it("promotes an Approved demand, publishing the exact DemandPromotedPayload; re-promote → DEMAND_006", async (ctx) => {
    if (!dockerAvailable) return ctx.skip();

    const id = await submitRequest(PM_A_TOKEN, "Promoted Portal");
    await advance(PM_A_TOKEN, id);   // → Screening
    await advance(PM_A_TOKEN, id);   // → Evaluation
    await advance(DIRECTOR_TOKEN, id); // → Approved (final gate)

    const before = promotedEvents.length;

    const promote = await request(httpServer)
      .post(`/api/v1/intake/requests/${id}/promote`)
      .set(auth(PM_A_TOKEN))
      .send({
        portfolioId: "11111111-1111-1111-1111-111111111111",
        programId: "22222222-2222-2222-2222-222222222222",
        plannedStart: "2026-09-01",
        plannedEnd: "2027-03-31",
        plannedBudget: 750000,
      });

    expect(promote.status).toBe(200);
    expect(promote.body.status).toBe("Promoted");

    // Exact payload captured off the EVENT_BUS (task 8.5).
    expect(promotedEvents.length).toBe(before + 1);
    const event = promotedEvents[promotedEvents.length - 1]!;
    expect(event.eventType).toBe("demand-intake.demand.promoted");
    expect(event.source).toBe("demand-intake");
    expect(event.data).toEqual({
      demandId: id,
      name: "Promoted Portal",
      portfolioId: "11111111-1111-1111-1111-111111111111",
      programId: "22222222-2222-2222-2222-222222222222",
      plannedStart: "2026-09-01",
      plannedEnd: "2027-03-31",
      plannedBudget: 750000,
    });

    // Downstream project-execution subscriber created the Project (sourceDemandId dedupe).
    const project = await prisma.project.findFirst({ where: { sourceDemandId: id } });
    expect(project).not.toBeNull();

    // Promoted is terminal — re-promote → DEMAND_006 (409).
    const rePromote = await request(httpServer)
      .post(`/api/v1/intake/requests/${id}/promote`)
      .set(auth(PM_A_TOKEN))
      .send({
        portfolioId: "11111111-1111-1111-1111-111111111111",
        plannedStart: "2026-09-01",
        plannedEnd: "2027-03-31",
      });
    expect(rePromote.status).toBe(409);
    expect(rePromote.body.code).toBe("DEMAND_006");
  });
});

// ---------------------------------------------------------------------------
// 8.6 — record-scope + audit rows + health
// ---------------------------------------------------------------------------

describe("8.6 — record-scope, audit, and health", () => {
  it("PM B cannot see PM A's requests (record scope); Director sees all; scoped GET → DEMAND_002", async (ctx) => {
    if (!dockerAvailable) return ctx.skip();

    const pmAId = await submitRequest(PM_A_TOKEN, "PM A Private Request");

    // PM B's list excludes PM A's request.
    const listB = await request(httpServer)
      .get("/api/v1/intake/requests")
      .set(auth(PM_B_TOKEN));
    expect(listB.status).toBe(200);
    expect((listB.body as { id: string }[]).map((r) => r.id)).not.toContain(pmAId);

    // Director sees all.
    const listDir = await request(httpServer)
      .get("/api/v1/intake/requests")
      .set(auth(DIRECTOR_TOKEN));
    expect((listDir.body as { id: string }[]).map((r) => r.id)).toContain(pmAId);

    // Direct scoped read by PM B is a 404 (info hiding).
    const scopedGet = await request(httpServer)
      .get(`/api/v1/intake/requests/${pmAId}`)
      .set(auth(PM_B_TOKEN));
    expect(scopedGet.status).toBe(404);
    expect(scopedGet.body.code).toBe("DEMAND_002");
  });

  it("writes an audit row on submit", async (ctx) => {
    if (!dockerAvailable) return ctx.skip();

    const id = await submitRequest(PM_A_TOKEN, "Audited Request");
    const auditRows = await prisma.auditLog.findMany({
      where: { entityType: "demand-request", entityId: id },
    });
    expect(auditRows.length).toBeGreaterThanOrEqual(1);
    expect(auditRows[0]?.action).toBe("create");
  });

  it("GET /health returns 200 with DemandIntakeModule registered", async (ctx) => {
    if (!dockerAvailable) return ctx.skip();

    const res = await request(httpServer).get("/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
  });
});
