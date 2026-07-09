import { describe, it, expect, vi } from "vitest";
import type { Request, Response } from "express";
import type { AuthContext } from "@epm/shared";

// Side-effect: register REPORT_* error codes (REPORT_001/003). AUTH_002 is core.
import "../../../../../../packages/shared/src/errors/report-error-codes.js";

import { ExportController } from "../controllers/export.controller.js";
import { RbacRegistry } from "../../../foundation/auth/rbac.registry.js";

// ---------------------------------------------------------------------------
// H4 — the export endpoint fans out to datasets that each have their own gate.
// `?reportType=` must be re-checked against the SAME per-dataset permission, so a
// caller holding only dashboard:read cannot pull a capacity (utilization) export.
//
// The controller carries a coarse @RequirePermission("dashboard:read"); the tests
// below prove the per-dataset gate is what actually stops the bypass — they would
// FAIL if that per-reportType rbac.permitted check were removed.
// ---------------------------------------------------------------------------

function makeRbac(): RbacRegistry {
  const rbac = new RbacRegistry();
  // A "viewer" role can see dashboards but NOT capacity/utilization.
  rbac.grant("EXECUTIVE_SPONSOR", "dashboard:read");
  // A capacity-authorized role holds utilization:read too.
  rbac.grant("RESOURCE_MANAGER", "dashboard:read", "utilization:read");
  return rbac;
}

function makeReq(roles: AuthContext["roles"]): Request {
  return {
    auth: { userId: "u-1", roles, recordScopes: [] },
  } as unknown as Request;
}

function makeRes(): Response {
  return {
    set: vi.fn(),
    send: vi.fn(),
  } as unknown as Response;
}

function makeController(overrides: { rows?: unknown[] } = {}) {
  const dashboardService = {
    getExportRows: vi.fn().mockResolvedValue(overrides.rows ?? [{ id: "r1" }]),
  };
  const exportService = {
    exportToCsv: vi.fn().mockReturnValue({ csv: "id\nr1", filename: "capacity.csv", rowCount: 1 }),
  };
  const rbac = makeRbac();
  const controller = new ExportController(
    dashboardService as never,
    exportService as never,
    rbac,
  );
  return { controller, dashboardService, exportService };
}

describe("ExportController — H4 per-dataset export authorization", () => {
  it("rejects a dashboard:read-only role from a capacity export (missing utilization:read)", async () => {
    const { controller, dashboardService } = makeController();
    const req = makeReq(["EXECUTIVE_SPONSOR"]); // has dashboard:read, NOT utilization:read
    const res = makeRes();

    await expect(
      controller.exportReport("capacity", undefined, undefined, undefined, undefined, req, res),
    ).rejects.toMatchObject({ code: "AUTH_002", status: 403 });

    // gate must trip BEFORE any dataset is fetched
    expect(dashboardService.getExportRows).not.toHaveBeenCalled();
  });

  it("rejects an unknown reportType with REPORT_003", async () => {
    const { controller } = makeController();
    const req = makeReq(["RESOURCE_MANAGER"]); // even a privileged role
    const res = makeRes();

    await expect(
      controller.exportReport("totally-unknown", undefined, undefined, undefined, undefined, req, res),
    ).rejects.toMatchObject({ code: "REPORT_003" });
  });

  it("allows a role holding utilization:read to run a capacity export", async () => {
    const { controller, dashboardService, exportService } = makeController();
    const req = makeReq(["RESOURCE_MANAGER"]); // has utilization:read
    const res = makeRes();

    await controller.exportReport(
      "capacity", undefined, undefined, undefined, undefined, req, res,
    );

    expect(dashboardService.getExportRows).toHaveBeenCalledOnce();
    expect(exportService.exportToCsv).toHaveBeenCalledOnce();
    expect(res.send).toHaveBeenCalledWith("id\nr1");
  });

  it("risk-summary export requires raid:read (a dashboard-only role is rejected)", async () => {
    const { controller } = makeController();
    const req = makeReq(["EXECUTIVE_SPONSOR"]);
    const res = makeRes();

    await expect(
      controller.exportReport("risk-summary", undefined, undefined, undefined, undefined, req, res),
    ).rejects.toMatchObject({ code: "AUTH_002" });
  });
});
