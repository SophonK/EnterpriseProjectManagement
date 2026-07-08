# Build Instructions — Unit: foundation

## Prerequisites
- **Node.js** 20+ (verified on v22 in CI/dev)
- **pnpm** via Corepack: `corepack enable` (pin `pnpm@9.7.0` from `package.json`)
- **PostgreSQL** 16 reachable via `DATABASE_URL` (only needed for migrate/integration, not for build/unit tests)

## Build steps
```bash
corepack enable
pnpm install --frozen-lockfile          # CI: frozen; dev: pnpm install
pnpm --filter @epm/db exec prisma generate   # generate typed Prisma client
pnpm build                              # Turborepo: build all packages (tsc)
```
Expected: `@epm/shared` and `@epm/api` compile to `dist/` (config/db are non-emitting).

## Build artifacts
- `packages/shared/dist/` — published contract package `@epm/shared`
- `apps/api/dist/` — compiled Modular Monolith (`dist/main.js` entry)
- Prisma client generated into `node_modules/@prisma/client`

## Troubleshooting
- **`turbo: cannot find binary path`** — pnpm not on PATH. Run `corepack enable` first (CI does this). Locally you can substitute `pnpm -r build`.
- **`Environment variable not found: DATABASE_URL`** — only affects prisma commands; copy `.env.example` → `.env` or export `DATABASE_URL`.
- **`TS6059 rootDir`** — ensure workspace packages are consumed via built dist (no source path alias); run `pnpm --filter @epm/shared build` first.
