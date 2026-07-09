// @epm/shared — risk-raid unit error codes.
// Side-effect import: registers codes into the shared registry on module load.
import { registerErrorCodes } from "./error-codes.js";

registerErrorCodes({
  RISK_001: {
    status: 400,
    title: "RAID item validation failed",
    type: "/errors/risk/validation",
  },
  RISK_002: {
    status: 404,
    title: "Referenced project not found",
    type: "/errors/risk/ref-not-found",
  },
  RISK_003: {
    status: 409,
    title: "Duplicate or circular dependency",
    type: "/errors/risk/circular-dependency",
  },
  RISK_004: {
    status: 404,
    title: "RAID item or dependency not found",
    type: "/errors/risk/not-found",
  },
  RISK_005: {
    status: 422,
    title: "Invalid status transition",
    type: "/errors/risk/invalid-transition",
  },
});
