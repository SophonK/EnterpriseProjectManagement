// @epm/shared — reporting-dashboards unit error codes.
// Side-effect import: registers codes into the shared registry on module load.
import { registerErrorCodes } from "./error-codes.js";

registerErrorCodes({
  REPORT_001: {
    status: 400,
    title: "Report validation failed",
    type: "/errors/report/validation",
  },
  REPORT_002: {
    status: 400,
    title: "Export row limit exceeded",
    type: "/errors/report/row-limit",
  },
  REPORT_003: {
    status: 400,
    title: "Unknown report type",
    type: "/errors/report/unknown-type",
  },
});
