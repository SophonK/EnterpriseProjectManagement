// @epm/shared — project-execution unit error codes.
// Side-effect import: registers codes into the shared registry on module load.
import { registerErrorCodes } from "./error-codes.js";

registerErrorCodes({
  EXECUTION_001: {
    status: 400,
    title: "Project validation failed",
    type: "/errors/execution/validation",
  },
  EXECUTION_002: {
    status: 404,
    title: "Portfolio or program not found",
    type: "/errors/execution/ref-not-found",
  },
  EXECUTION_003: {
    status: 422,
    title: "Invalid status transition",
    type: "/errors/execution/invalid-transition",
  },
  EXECUTION_004: {
    status: 409,
    title: "Duplicate project name in portfolio",
    type: "/errors/execution/duplicate",
  },
  EXECUTION_005: {
    status: 404,
    title: "Resource not found",
    type: "/errors/execution/not-found",
  },
});
