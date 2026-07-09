# EPM Platform — Web

React (TypeScript) client for the Enterprise Project & Portfolio Management platform. Lives
in the backend monorepo as `apps/web` and consumes the workspace contract package
`@epm/shared` (`workspace:*`) for DTOs, error codes, and event types.

## Stack

- **Vite** + **React 18** + **TypeScript** (strict)
- **Mantine 7** — UI kit (AppShell, tables, forms, RingProgress)
- **TanStack Query 5** — server state / caching
- **React Router 6** — routing

## Auth

The backend owns the OIDC flow. The web never handles tokens directly:

1. "Sign in" navigates to `/auth/login` → the IdP → `/auth/callback`, which sets **httpOnly**
   `epm_access` / `epm_refresh` cookies and redirects back to `/`.
2. Every API call uses `credentials: "include"`, so the cookie rides along. In dev the Vite
   proxy forwards `/api`, `/auth`, `/health` to the backend so it's all one origin.
3. A `401` broadcasts `epm:unauthorized`; the app bounces to `/login`.

## Run

```bash
pnpm install                    # from the monorepo root — links @epm/shared (workspace:*)
pnpm --filter @epm/web dev      # http://localhost:5173  (proxies API to http://localhost:3000)
pnpm --filter @epm/web typecheck
pnpm --filter @epm/web build
```

The backend must be running (`node dist/main.js` in the api app, on :3000) and its
`@epm/shared` package built (`pnpm --filter @epm/shared build`). Override the proxy target
with `VITE_API_TARGET` (see `.env.example`).

> Full authenticated flows require the OIDC IdP to be running (`OIDC_ISSUER`). Without it,
> the shell loads and `/health` shows API connectivity, but data pages will 401 until login.

## Structure

```
src/
  lib/        api-client (RFC7807), auth (cookie session), queries (TanStack hooks)
  components/ AppShell, ProtectedRoute, ProblemAlert
  pages/      Login, Portfolios (list + create), PortfolioHealth (dashboard), NotFound
```

## Scope

First pass: scaffold + auth + typed API client + app shell + **Portfolios** (list/create) and
**Portfolio Health** (dashboard). Remaining domains (goals, programs, projects, resources,
risk/RAID, demand intake, reporting/export) are stubbed in the nav (`soon`) for follow-up.
