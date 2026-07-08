# API Spec — project-execution

Base path: `/api/v1`
Auth: `Authorization: Bearer <JWT>` on every request
Response format: `application/json`; errors: `application/problem+json` (RFC 7807)

---

## Projects

### POST /api/v1/projects
Create a new project.

**Permission**: EPMO Director, Portfolio Manager, Project Manager

**Request body**:
```json
{
  "name": "Mobile App Rev 2",
  "description": "Optional description",
  "portfolioId": "uuid",
  "programId": "uuid | null",
  "plannedStart": "2026-08-01",
  "plannedEnd": "2027-02-28",
  "plannedBudget": 250000.00
}
```

**Validation** (Zod):
- `name`: string, 1–200 chars
- `portfolioId`: UUID, required
- `programId`: UUID, optional
- `plannedStart`, `plannedEnd`: ISO date, required; `plannedEnd >= plannedStart`
- `plannedBudget`: positive number, optional

**Responses**:
- `201 Created` — `ProjectDTO`
- `400 Bad Request` — `EXECUTION_001` (validation error)
- `404 Not Found` — `EXECUTION_002` (portfolio not found)
- `403 Forbidden` — `AUTH_002`

**Events emitted**: `project-execution.project.created`

---

### GET /api/v1/projects
List projects (record-scoped).

**Permission**: All authenticated roles (scoped to record access)

**Query params**:
- `portfolioId` (UUID, optional)
- `programId` (UUID, optional)
- `health` (OnTrack | AtRisk | OffTrack, optional)
- `status` (Open | Active | Completed | Cancelled, optional)
- `page` (int, default 1) · `pageSize` (int, default 20, max 100)

**Response**: `200 OK`
```json
{
  "data": [ProjectDTO],
  "total": 42,
  "page": 1,
  "pageSize": 20
}
```

---

### GET /api/v1/projects/:id
Get a single project.

**Permission**: scoped to record access

**Response**: `200 OK` — `ProjectDTO` | `404 Not Found`

---

### PATCH /api/v1/projects/:id
Update project attributes (name, description, dates, plannedBudget, programId).

**Permission**: EPMO Director, Portfolio Manager (own portfolio), Project Manager (own project)

**Request body**: partial subset of create fields (any combination)

**Validation**: same rules; `plannedEnd >= plannedStart` still enforced across merged values

**Response**: `200 OK` — `ProjectDTO`

---

### DELETE /api/v1/projects/:id
Archive project (soft-delete). Sets `archivedAt`.

**Permission**: EPMO Director, Portfolio Manager

**Response**: `204 No Content`

---

## Milestones

### POST /api/v1/projects/:projectId/milestones
Add a milestone.

**Permission**: EPMO Director, Project Manager (own project)

**Request body**:
```json
{
  "title": "Beta Launch",
  "description": null,
  "dueDate": "2026-11-30",
  "sortOrder": 1
}
```

**Validation**: `title` 1–300 chars; `dueDate` ISO date required

**Response**: `201 Created` — `MilestoneDTO`

---

### GET /api/v1/projects/:projectId/milestones
List milestones for a project.

**Response**: `200 OK` — `MilestoneDTO[]` ordered by `sortOrder`

Overdue milestones include `"overdue": true`.

---

### PATCH /api/v1/projects/:projectId/milestones/:id
Update milestone (title, dueDate, completedAt, sortOrder).

Setting `completedAt` to a timestamp marks it complete and clears `overdue = false`.

**Response**: `200 OK` — `MilestoneDTO`

---

### DELETE /api/v1/projects/:projectId/milestones/:id
Delete a milestone (hard delete — no historical significance).

**Response**: `204 No Content`

---

## Status & Health

### POST /api/v1/projects/:id/status
Update project status and health (appends to history).

**Permission**: EPMO Director, Portfolio Manager, Project Manager (own project)

**Request body**:
```json
{
  "status": "Active",
  "health": "AtRisk",
  "note": "Backend integration delayed by 2 weeks."
}
```

**Validation**: `status` and `health` enums; note max 1000 chars

**State machine rules** (enforced in service):
- `Open` → `Active` ✅
- `Active` → `Completed` ✅ | `Cancelled` ✅
- `Active` → `Open` ❌ (invalid transition → `EXECUTION_003`)
- `Completed` / `Cancelled` → any ❌ (terminal)

**Response**: `201 Created` — `StatusUpdateDTO`

**Events emitted**: `project-execution.project.status-changed`, triggers roll-up recomputation

---

### GET /api/v1/projects/:id/status/history
Retrieve chronological status update history.

**Response**: `200 OK` — `StatusUpdateDTO[]` ordered `recordedAt DESC`

---

## Roll-Up

### GET /api/v1/portfolios/:portfolioId/rollup
Get the latest roll-up snapshot for a portfolio (counts by health).

**Permission**: EPMO Director, Portfolio Manager

**Response**: `200 OK`
```json
{
  "portfolioId": "uuid",
  "programId": null,
  "onTrackCount": 10,
  "atRiskCount": 3,
  "offTrackCount": 1,
  "totalCount": 14,
  "computedAt": "2026-07-08T09:00:00Z"
}
```

### GET /api/v1/portfolios/:portfolioId/programs/:programId/rollup
Same for a specific program within a portfolio.

---

## DTOs

### ProjectDTO
```typescript
{
  id: string;
  name: string;
  description: string | null;
  ownerUserId: string;
  portfolioId: string;
  programId: string | null;
  status: 'Open' | 'Active' | 'Completed' | 'Cancelled';
  health: 'OnTrack' | 'AtRisk' | 'OffTrack';
  plannedStart: string;   // ISO date
  plannedEnd: string;
  plannedBudget: number | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}
```

### MilestoneDTO
```typescript
{
  id: string;
  projectId: string;
  title: string;
  description: string | null;
  dueDate: string;
  completedAt: string | null;
  overdue: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}
```

### StatusUpdateDTO
```typescript
{
  id: string;
  projectId: string;
  status: string;
  health: string;
  note: string | null;
  recordedBy: string;
  recordedAt: string;
}
```

---

## Error Codes

| Code | HTTP | Meaning |
|------|------|---------|
| `EXECUTION_001` | 400 | Validation error (field-level detail in `errors[]`) |
| `EXECUTION_002` | 404 | Portfolio or program not found |
| `EXECUTION_003` | 422 | Invalid status transition |
| `EXECUTION_004` | 409 | Duplicate project name within portfolio |
| `AUTH_001` | 401 | Unauthenticated |
| `AUTH_002` | 403 | Insufficient permission or record-scope denied |
| `NOT_FOUND` | 404 | Project / milestone not found |
| `INTERNAL` | 500 | Unexpected server error |
