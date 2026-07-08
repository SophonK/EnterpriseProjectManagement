# Foundation — API Spec

Foundation exposes only cross-cutting endpoints. Domain endpoints belong to their units.

## Endpoints

### GET /health
Liveness/readiness. No auth.
- **200** `{ status: "ok", db: "up", version }`
- **503** `{ status: "degraded", db: "down" }` (readiness fails → deploy gate / rollback)

### GET /auth/login
Initiates OIDC Authorization Code flow (redirect to IdP). No auth.
- **302** → IdP authorize URL (state + PKCE)

### GET /auth/callback
OIDC redirect URI. Exchanges code, issues app JWT + refresh.
- **302** → app with session (httpOnly cookie or token)
- **401** `problem+json` `AUTH_001` if assertion invalid

### POST /auth/refresh
Exchanges refresh token for a new access token.
- **200** `{ accessToken, expiresIn }`
- **401** `AUTH_001`

### POST /auth/logout
Invalidates session.
- **204**

## Cross-Cutting Conventions (apply to ALL unit endpoints)
- Base path `/api/v1/`; unit resources under `/api/v1/{unit-resource}`.
- **AuthN**: `Authorization: Bearer <JWT>`; verified by `AuthModule`, injects `AuthContext`.
- **AuthZ**: handler declares `requirePermission(...)`; `RbacGuard` + `ScopeGuard` enforce role + record scope (deny by default).
- **Errors**: RFC 7807 `application/problem+json` `{ type, title, status, detail?, code, requestId }`.
- **Correlation**: every response carries `X-Request-Id` (generated if absent).
- **Validation**: request bodies validated by Zod schemas from `@epm/shared`; failure → `VALIDATION_001` (400).
- **Pagination** (list endpoints): `?page`, `?pageSize` (default 25, max 100); response `{ data, page, pageSize, total }`.

## Shared Error Codes
| Code | HTTP | Meaning |
|---|---|---|
| VALIDATION_001 | 400 | Request failed schema validation |
| AUTH_001 | 401 | Unauthenticated / invalid token |
| AUTH_002 | 403 | Authenticated but not permitted / out of scope |
| NOT_FOUND | 404 | Resource missing |
| CONFLICT_001 | 409 | State conflict (e.g., duplicate) |
| INTERNAL | 500 | Unhandled server error |
