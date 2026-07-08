# Security Test Instructions — Unit: foundation

Covers the security-baseline extension (blocking) at the foundation layer.

## Automated checks (in the unit suite)
| Control | Test / mechanism |
|---|---|
| RBAC record-scope, deny-by-default | `shared/auth/access.test.ts` (P3) |
| Error responses don't leak internals | `api/errors/problem-details.filter.test.ts` (unknown → 500, message hidden) |
| Config fail-fast / no partial config | `api/config/config.schema.test.ts` (P5) |

## Verified-by-design (runtime, needs live IdP — see code)
| Control | Where |
|---|---|
| OIDC authN + JWT verify via JWKS (fail closed) | `auth/token-verifier.ts` |
| Global guard, protected-route-without-permission refused | `auth/auth.guard.ts` |
| Secret redaction in logs | `logging/logger.ts` (pino redact) |
| Immutable audit on access-denied + state change | `audit/*` |
| Security headers + auth rate limiting | `main.ts` (helmet + express-rate-limit) |

## Recommended additional runtime tests (post-IdP)
- authN: request without/with invalid Bearer → 401 `AUTH_001`.
- authZ: valid token lacking permission → 403 `AUTH_002` + audit row.
- rate limit: >N `/auth/*` requests/min → 429.
- headers: assert helmet headers present.
- secret scan in CI (e.g. gitleaks) to enforce SEC-4.
