# Foundation — Components

Shared infrastructure components exposed to all domain units (as NestJS modules/providers in `apps/api/src/foundation/` and packages in `packages/`).

## Component Map

| Component | Location | Responsibility | Consumed by |
|---|---|---|---|
| **AppBootstrap** | `apps/api/src/main.ts` | Composition root — instantiate NestJS app, register foundation + domain modules, start server | — |
| **AuthModule** | `foundation/auth/` | OIDC login/callback, JWT verification (jose), builds `AuthContext` | all units (guards) |
| **RbacGuard / ScopeGuard** | `foundation/auth/` | Enforce role permission + record-level scope per handler | all units |
| **ErrorFilter** | `foundation/errors/` | Map thrown `AppError` → RFC 7807 `problem+json`; attach `requestId` | all units |
| **EventBus** | `foundation/events/` | Typed in-process publish/subscribe of `DomainEvent<T>`; idempotency helper | all units |
| **PrismaService** | `foundation/db/` | Prisma client lifecycle; per-schema access | all units (repositories) |
| **AuditService** | `foundation/audit/` | Append immutable audit entries on state changes + access-denied | all units |
| **ConfigService** | `foundation/config/` | Zod-validated env config; secret resolution | all units |
| **Logger** | `foundation/logging/` | pino structured logger + `X-Request-Id` correlation middleware | all units |
| **HealthController** | `foundation/health/` | `/health` liveness/readiness (DB check) | ops/CI |
| **@epm/shared** | `packages/shared/` | Domain types, DTOs, Zod schemas, error codes, `DomainEvent<T>`, `AuthContext`, `RecordScope` | all units + web |
| **@epm/db** | `packages/db/` | Prisma schema(s), per-unit migrations, seed | all units |
| **@epm/config** | `packages/config/` | ESLint, Prettier, base tsconfig | all packages |

## Key Interfaces (signatures)

```ts
// @epm/shared
interface AuthContext { userId: string; roles: Role[]; recordScopes: RecordScope[]; }
interface DomainEvent<T> { eventId: string; eventType: string; occurredAt: string; source: string; data: T; }
interface ProblemDetails { type: string; title: string; status: number; detail?: string; code: string; requestId: string; }

// foundation/events
interface EventBus {
  publish<T>(event: DomainEvent<T>): Promise<void>;
  subscribe<T>(eventType: string, handler: (e: DomainEvent<T>) => Promise<void>): void; // idempotent by eventId
}

// foundation/auth
interface AuthService { verify(token: string): Promise<AuthContext>; }
function requirePermission(perm: Permission): MethodDecorator; // guard metadata
```

## Notes
- Foundation exposes **no domain endpoints** beyond `/health` and the OIDC callback scaffold — domain APIs live in their units.
- All components are provider-injected; domain modules depend on foundation providers, never the reverse.
