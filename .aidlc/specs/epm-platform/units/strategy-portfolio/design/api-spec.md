# API Spec — strategy-portfolio

## Summary

REST surface for the `strategy-portfolio` unit, mounted under the platform prefix `/api/v1`
with the unit segment `/strategy`. Twelve endpoints across five resource groups cover the six
stories: strategic goals (US-006), portfolios + goal association (US-007), programs (US-011),
project→goal links (US-008), the investment-mix view (US-009), and the unaligned-work report
(US-010). Every request carries `Authorization: Bearer <JWT>`, is RBAC-guarded and
record-scoped (Portfolio Manager limited to `ownerId`; EPMO Director sees all), and validates
its body/query with a Zod DTO. Successful bodies are `application/json`; errors are
`application/problem+json` (RFC 7807) using the `STRATEGY_*` / `AUTH_*` codes in the Error
Codes table. Link and goal-association endpoints are idempotent (P3).

Base path: `/api/v1`
Unit segment: `/strategy`
Auth: `Authorization: Bearer <JWT>` on every request
Response format: `application/json`; errors: `application/problem+json` (RFC 7807)

---

## Strategic Goals (US-006)

### POST /strategy/goals
Define a strategic goal / OKR.

**Permission**: EPMO Director

**Request body**:
```json
{
  "title": "Grow ARR 30%",
  "description": "Increase annual recurring revenue across all segments",
  "measure": "ARR reaches $65M by FY-end"
}
```

**Validation** (Zod — `DefineStrategicGoal`):
- `title`: string, 1–200 chars, required
- `description`: string, 1–2000 chars, required
- `measure`: string, 1–2000 chars, required

**Responses**:
- `201 Created` — `StrategicGoalDTO`
- `400 Bad Request` — `STRATEGY_001` (missing/invalid required field)
- `401 Unauthorized` — `AUTH_001`
- `403 Forbidden` — `AUTH_002`

**Events emitted**: none

---

### GET /strategy/goals
List strategic goals.

**Permission**: EPMO Director, Portfolio Manager

**Query params**:
- `status` (Active | Archived, optional)

**Response**: `200 OK` — `StrategicGoalDTO[]`

---

### POST /strategy/goals/:id/archive
Archive a strategic goal (sets `status = Archived`).

**Permission**: EPMO Director

**Responses**:
- `204 No Content`
- `404 Not Found` — `STRATEGY_002` (goal not found)
- `403 Forbidden` — `AUTH_002`

---

## Portfolios (US-007)

### POST /strategy/portfolios
Create a portfolio. The caller becomes the `ownerId`.

**Permission**: Portfolio Manager (also EPMO Director)

**Request body**:
```json
{
  "name": "Digital Transformation",
  "description": "Optional description"
}
```

**Validation** (Zod — `CreatePortfolio`):
- `name`: string, 1–200 chars, required
- `description`: string, max 2000 chars, optional/nullable

**Responses**:
- `201 Created` — `PortfolioDTO` (`ownerId` = caller)
- `400 Bad Request` — `STRATEGY_001`
- `403 Forbidden` — `AUTH_002`

**Events emitted**: `strategy-portfolio.portfolio.created`

---

### GET /strategy/portfolios
List portfolios. Record-scoped: Portfolio Manager sees only portfolios they own; EPMO
Director sees all.

**Permission**: EPMO Director (all), Portfolio Manager (own)

**Query params**:
- `status` (Active | Archived, optional)

**Response**: `200 OK` — `PortfolioDTO[]`

---

### GET /strategy/portfolios/:id
Get a single portfolio.

**Permission**: EPMO Director (all), Portfolio Manager (own — record-scoped)

**Responses**:
- `200 OK` — `PortfolioDTO`
- `404 Not Found` — `STRATEGY_003` (not found or scope-denied — info hiding)
- `403 Forbidden` — `AUTH_002`

---

### POST /strategy/portfolios/:id/goals
Associate one or more strategic goals with a portfolio (idempotent, D3-3/P3).

**Permission**: EPMO Director, Portfolio Manager (own portfolio)

**Request body**:
```json
{ "goalIds": ["uuid", "uuid"] }
```

**Validation** (Zod — `AssociateGoals`):
- `goalIds`: array of UUID, min length 1, required

**Responses**:
- `200 OK` — `PortfolioDTO` (with associated goal ids) — idempotent; re-sending the same pair is a no-op
- `400 Bad Request` — `STRATEGY_001`
- `404 Not Found` — `STRATEGY_003` (portfolio not found) or `STRATEGY_002` (a goalId not found)
- `403 Forbidden` — `AUTH_002`

---

## Programs (US-011)

### POST /strategy/portfolios/:id/programs
Create a program within the portfolio (`:id` = parent portfolioId, required — D3-6).

**Permission**: EPMO Director, Portfolio Manager (own portfolio)

**Request body**:
```json
{
  "name": "Cloud Migration",
  "description": "Optional description"
}
```

**Validation** (Zod — `CreateProgram`):
- `name`: string, 1–200 chars, required
- `description`: string, max 2000 chars, optional/nullable

**Responses**:
- `201 Created` — `ProgramDTO`
- `400 Bad Request` — `STRATEGY_001`
- `404 Not Found` — `STRATEGY_003` (parent portfolio not found)
- `403 Forbidden` — `AUTH_002`

**Events emitted**: `strategy-portfolio.program.created`

---

### GET /strategy/portfolios/:id/programs
List programs within a portfolio.

**Permission**: EPMO Director, Portfolio Manager (own portfolio)

**Response**: `200 OK` — `ProgramDTO[]`
- `404 Not Found` — `STRATEGY_003` (portfolio not found)

---

## Goal Links (US-008)

### POST /strategy/goal-links
Link a project to one or more strategic goals (idempotent upsert, D3-2/P3). On link the
alignment for the project is recomputed and the projection updated.

**Permission**: EPMO Director, Portfolio Manager

**Request body**:
```json
{
  "projectId": "uuid",
  "goalIds": ["uuid", "uuid"]
}
```

**Validation** (Zod — `LinkProjectToGoal`):
- `projectId`: UUID, required
- `goalIds`: array of UUID, min length 1, required

**Responses**:
- `201 Created` — `GoalLinkDTO[]` (one per (goalId, projectId) pair) — idempotent; re-linking an existing pair returns it without error or duplicate
- `400 Bad Request` — `STRATEGY_001`
- `404 Not Found` — `STRATEGY_002` (a goalId not found)
- `403 Forbidden` — `AUTH_002`

**Events emitted**: `strategy-portfolio.project.linked-to-goal` (and, if the project was
active + unaligned before this link, alignment is recomputed — the prior
`strategy-portfolio.project.flagged-unaligned` state clears)

---

### DELETE /strategy/goal-links/:id
Remove a project↔goal link. Alignment is recomputed for the affected project afterward.

**Permission**: EPMO Director, Portfolio Manager

**Responses**:
- `204 No Content`
- `404 Not Found` — `STRATEGY_006` (goal link not found)
- `403 Forbidden` — `AUTH_002`

---

## Investment Mix (US-009)

### GET /strategy/investment-mix?groupBy=goal|portfolio
On-demand investment-mix aggregation over the alignment projection (D3-5): project count and
aggregate planned budget per grouping. A project linked to N goals contributes to N goal-groups
by design (P1, per-link expansion).

**Permission**: EPMO Director, Portfolio Manager

**Query params**:
- `groupBy` (goal | portfolio, required)

**Validation** (Zod — `ViewInvestmentMix`):
- `groupBy`: enum `'goal' | 'portfolio'`, required

**Response**: `200 OK` — `InvestmentSummary[]`
```json
[
  {
    "groupingType": "goal",
    "groupId": "uuid",
    "groupName": "Grow ARR 30%",
    "projectCount": 7,
    "totalPlannedBudget": 1250000.00
  }
]
```

- `400 Bad Request` — `STRATEGY_001` (missing/invalid `groupBy`)
- `403 Forbidden` — `AUTH_002`

---

## Alignment (US-010)

### GET /strategy/alignment/unaligned
Surface unaligned work: active projects with no linked strategic goal (projection where
`status = Active AND aligned = false`, D3-4). Returns an explicit `fullyAligned` empty-state
flag; otherwise each item includes owner and portfolio.

**Permission**: EPMO Director

**Response**: `200 OK` — `UnalignedReportDTO`
```json
{
  "items": [
    {
      "projectId": "uuid",
      "name": "Legacy CRM Sunset",
      "ownerId": "uuid",
      "portfolioId": "uuid",
      "portfolioName": "Digital Transformation"
    }
  ],
  "fullyAligned": false
}
```

When there are no unaligned active projects: `{ "items": [], "fullyAligned": true }`.

- `403 Forbidden` — `AUTH_002`

---

## DTOs

### StrategicGoalDTO
```typescript
{
  id: string;
  title: string;
  description: string;
  measure: string;
  status: 'Active' | 'Archived';
  createdBy: string;
  createdAt: string;   // ISO datetime
  updatedAt: string;
}
```

### PortfolioDTO
```typescript
{
  id: string;
  name: string;
  description: string | null;
  ownerId: string;
  status: 'Active' | 'Archived';
  goalIds: string[];   // associated strategic goals (via PortfolioGoal)
  createdAt: string;
  updatedAt: string;
}
```

### ProgramDTO
```typescript
{
  id: string;
  portfolioId: string;
  name: string;
  description: string | null;
  status: 'Active' | 'Archived';
  createdAt: string;
  updatedAt: string;
}
```

### GoalLinkDTO
```typescript
{
  id: string;
  goalId: string;
  projectId: string;   // soft ref to execution.project
  linkedBy: string;
  createdAt: string;
}
```

### InvestmentSummary
```typescript
{
  groupingType: 'goal' | 'portfolio';
  groupId: string;
  groupName: string;
  projectCount: number;
  totalPlannedBudget: number;   // SUM of plannedBudget in the group; 0 when all null
}
```

### UnalignedReportDTO
```typescript
{
  items: {
    projectId: string;
    name: string;
    ownerId: string;
    portfolioId: string | null;
    portfolioName: string | null;
  }[];
  fullyAligned: boolean;   // true iff items is empty
}
```

---

## Error Codes

| Code | HTTP | Meaning |
|------|------|---------|
| `STRATEGY_001` | 400 | Validation error (field-level detail in `errors[]`) |
| `STRATEGY_002` | 404 | Strategic goal not found |
| `STRATEGY_003` | 404 | Portfolio not found (or record-scope denied — info hiding) |
| `STRATEGY_004` | 404 | Program not found |
| `STRATEGY_006` | 404 | Goal link not found |
| `AUTH_001` | 401 | Unauthenticated |
| `AUTH_002` | 403 | Insufficient permission or record-scope denied |
| `NOT_FOUND` | 404 | Resource not found (generic) |
| `INTERNAL` | 500 | Unexpected server error |

All error responses use `application/problem+json` (RFC 7807): `type`, `title`, `status`,
`detail`, `instance`, plus a `code` member and, for `STRATEGY_001`, an `errors[]` array of
field-level issues.
