# syntax=docker/dockerfile:1
# OPTIONAL containerized build (method 2). The primary workflow runs Node directly
# (see README + .github/workflows/ci.yml). Build context = repo root:
#   docker build -f apps/api/Dockerfile -t epm-api .

FROM node:20-alpine AS base
RUN corepack enable
WORKDIR /repo

FROM base AS build
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml turbo.json tsconfig.base.json ./
COPY packages ./packages
COPY apps ./apps
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @epm/db exec prisma generate
RUN pnpm --filter @epm/shared build && pnpm --filter @epm/api build

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /repo ./
EXPOSE 3000
# Readiness is exposed at GET /health for orchestrator health checks.
CMD ["node", "apps/api/dist/main.js"]
