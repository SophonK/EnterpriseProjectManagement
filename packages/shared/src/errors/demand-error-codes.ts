// @epm/shared — demand-intake unit error codes.
// Side-effect import: registers codes into the shared registry on module load.
import { registerErrorCodes } from "./error-codes.js";

registerErrorCodes({
  DEMAND_001: {
    status: 400,
    title: "Demand validation failed",
    type: "/errors/demand/validation",
  },
  DEMAND_002: {
    status: 404,
    title: "Demand request not found",
    type: "/errors/demand/request-not-found",
  },
  DEMAND_003: {
    status: 404,
    title: "Scoring model not found",
    type: "/errors/demand/scoring-model-not-found",
  },
  DEMAND_004: {
    status: 400,
    title: "Invalid score",
    type: "/errors/demand/invalid-score",
  },
  DEMAND_005: {
    status: 409,
    title: "Illegal stage-gate transition",
    type: "/errors/demand/illegal-transition",
  },
  DEMAND_006: {
    status: 409,
    title: "Demand not in Approved status",
    type: "/errors/demand/not-approved",
  },
  DEMAND_007: {
    status: 409,
    title: "Demand not in a scorable status",
    type: "/errors/demand/not-scorable",
  },
});
