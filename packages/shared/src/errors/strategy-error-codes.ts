// @epm/shared — strategy-portfolio unit error codes.
// Side-effect import: registers codes into the shared registry on module load.
// Note: STRATEGY_005 is intentionally reserved / unused per the api-spec Error Codes
// table (goal-link-not-found is STRATEGY_006).
import { registerErrorCodes } from "./error-codes.js";

registerErrorCodes({
  STRATEGY_001: {
    status: 400,
    title: "Strategy validation failed",
    type: "/errors/strategy/validation",
  },
  STRATEGY_002: {
    status: 404,
    title: "Strategic goal not found",
    type: "/errors/strategy/goal-not-found",
  },
  STRATEGY_003: {
    status: 404,
    title: "Portfolio not found",
    type: "/errors/strategy/portfolio-not-found",
  },
  STRATEGY_004: {
    status: 404,
    title: "Program not found",
    type: "/errors/strategy/program-not-found",
  },
  STRATEGY_006: {
    status: 404,
    title: "Goal link not found",
    type: "/errors/strategy/goal-link-not-found",
  },
});
