// @epm/shared — resource-management unit error codes.
// Side-effect import: registers codes into the shared registry on module load.
import { registerErrorCodes } from "./error-codes.js";

registerErrorCodes({
  RESOURCE_001: {
    status: 400,
    title: "Resource validation failed",
    type: "/errors/resource/validation",
  },
  RESOURCE_002: {
    status: 404,
    title: "Referenced entity not found",
    type: "/errors/resource/ref-not-found",
  },
  RESOURCE_003: {
    status: 409,
    title: "Duplicate resource or skill",
    type: "/errors/resource/duplicate",
  },
  RESOURCE_004: {
    status: 422,
    title: "Over-allocation not confirmed",
    type: "/errors/resource/over-allocation",
  },
  RESOURCE_005: {
    status: 404,
    title: "Resource or allocation not found",
    type: "/errors/resource/not-found",
  },
  RESOURCE_006: {
    status: 403,
    title: "Resource pool outside caller scope",
    type: "/errors/resource/pool-forbidden",
  },
});
