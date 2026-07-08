# identity-access — API Spec

Base `/api/v1/identity`. All endpoints require auth; admin ops require `identity:*` (EPMO Director).
Errors are RFC 7807 (foundation filter). Validation via Zod (`@epm/shared`).

## Endpoints

### GET /api/v1/identity/users
List users (paginated). Permission: `identity:list-users`.
- **200** `{ data: User[], page, pageSize, total }`

### POST /api/v1/identity/users/:userId/roles
Assign a role (US-002). Permission: `identity:assign-role`.
- Body: `{ role: Role }`
- **204** · **404** `NOT_FOUND` (user) · **409** `CONFLICT_001` (already assigned)

### DELETE /api/v1/identity/users/:userId/roles/:role
Revoke a role. Permission: `identity:assign-role`.
- **204**

### POST /api/v1/identity/users/:userId/scopes
Grant a record scope (US-003). Permission: `identity:grant-scope`.
- Body: `{ scopeType, scopeId? , subtreeRootId? }` (one of scopeId/subtreeRootId required)
- **201** `{ id }` · **400** `VALIDATION_001`

### DELETE /api/v1/identity/users/:userId/scopes/:scopeId
Revoke a scope. Permission: `identity:grant-scope`.
- **204**

### GET /api/v1/identity/audit
View audit log (US-004), filterable (`?entityType`, `?actorId`, paginated). Permission: `identity:view-audit`.
- **200** `{ data: AuditEntry[], page, pageSize, total }`

## Internal (no HTTP) — foundation integration
- `AuthContextEnricher.enrich(userId, claims)` — called by foundation `TokenVerifier` per request to attach DB-resolved roles/scopes.
- `UserProvisioningService.upsertFromClaims(claims)` — called on the OIDC callback path (US-001).

## Every state change is audited
Role/scope grant/revoke → `AuditService.record` within the same transaction (create/delete/update, actor = requester).
