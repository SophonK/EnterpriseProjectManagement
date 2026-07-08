# API Spec — demand-intake

## Summary

REST surface for the `demand-intake` unit, mounted under the platform prefix `/api/v1` with the
unit segment `/intake`. Nine endpoints across five resource groups cover the four stories:
demand submission + listing (US-029), scoring-model configuration and per-request scoring +
ranking (US-030), the stage-gate advance/reject state machine (US-031), and promotion of an
approved demand to a project (US-032). Every request carries `Authorization: Bearer <JWT>`, is
RBAC-guarded (EPMO Director / Portfolio Manager per the matrix in `components.md`), and reads are
record-scoped (Portfolio Manager limited to their own `submittedBy` submissions; EPMO Director
sees all). Every body/query is validated with a Zod DTO. Successful bodies are
`application/json`; errors are `application/problem+json` (RFC 7807) using the `DEMAND_*` /
`AUTH_*` codes in the Error Codes table. The `advance` endpoint additionally enforces the
per-gate permission for the target transition; the `promote` endpoint publishes
`demand-intake.demand.promoted` and its request body maps exactly onto the `project-execution`
`DemandPromotedPayload` contract.

Base path: `/api/v1`
Unit segment: `/intake`
Auth: `Authorization: Bearer <JWT>` on every request
Response format: `application/json`; errors: `application/problem+json` (RFC 7807)

---

## Demand Requests (US-029)

### POST /intake/requests
Submit a demand intake request. Persists with `status = Submitted`, `currentGate = Submitted`.

**Permission**: Portfolio Manager (also EPMO Director)

**Request body**:
```json
{
  "title": "Customer Self-Service Portal",
  "sponsor": "VP Customer Success",
  "description": "Reduce inbound support volume with a self-service portal",
  "expectedValue": 750000.00
}
```

**Validation** (Zod — `SubmitIntake`):
- `title`: string, 1–200 chars, required
- `sponsor`: string, 1–200 chars, required
- `description`: string, 1–2000 chars, required
- `expectedValue`: number, ≥ 0, optional/nullable

**Responses**:
- `201 Created` — `DemandRequestDTO` (`status = Submitted`, `submittedBy` = caller)
- `400 Bad Request` — `DEMAND_001` (missing/invalid required field)
- `401 Unauthorized` — `AUTH_001`
- `403 Forbidden` — `AUTH_002`

**Events emitted**: `demand-intake.demand.submitted` `{ demandId, title, submittedBy }`

---

### GET /intake/requests
List demand requests. Record-scoped: Portfolio Manager sees only their own submissions
(`submittedBy`); EPMO Director sees all.

**Permission**: EPMO Director (all), Portfolio Manager (own)

**Query params**:
- `status` (`DemandStatus`, optional)

**Response**: `200 OK` — `DemandRequestDTO[]`

---

### GET /intake/requests/ranked
Ranked list of scored requests, ordered by descending `weightedTotal` with a stable tie-break on
`submittedAt` ascending (D3-3/P2). Registered ahead of `GET /intake/requests/:id` so the static
path wins.

**Permission**: EPMO Director, Portfolio Manager

**Response**: `200 OK` — `RankedDemandDTO[]`
```json
[
  {
    "demandRequestId": "uuid",
    "title": "Customer Self-Service Portal",
    "status": "Evaluation",
    "weightedTotal": 82.50,
    "rank": 1,
    "submittedAt": "2026-07-01T09:00:00.000Z"
  }
]
```

- `403 Forbidden` — `AUTH_002`

---

### GET /intake/requests/:id
Get a single demand request.

**Permission**: EPMO Director (all), Portfolio Manager (own — record-scoped)

**Responses**:
- `200 OK` — `DemandRequestDTO`
- `404 Not Found` — `DEMAND_002` (not found or record-scope denied — info hiding)
- `403 Forbidden` — `AUTH_002`

---

## Scoring Models (US-030)

### POST /intake/scoring-models
Configure a scoring model. Creates a **new version** with its weighted criteria and activates it,
deactivating any prior active model so exactly one is active (D3-3).

**Permission**: EPMO Director

**Request body**:
```json
{
  "name": "FY26 Intake Scoring",
  "criteria": [
    { "name": "Strategic Fit", "weight": 3, "maxScore": 100, "goalId": "uuid" },
    { "name": "Expected ROI", "weight": 2, "maxScore": 100 },
    { "name": "Delivery Risk", "weight": 1, "maxScore": 100 }
  ]
}
```

**Validation** (Zod — `ConfigureScoring`):
- `name`: string, 1–200 chars, required
- `criteria`: array, min length 1, required; each:
  - `name`: string, 1–200 chars, required
  - `weight`: number, > 0, required
  - `maxScore`: int, 1–1000, optional (default 100)
  - `goalId`: UUID, optional/nullable (soft ref, not validated — D3-1)

**Responses**:
- `201 Created` — `ScoringModelDTO` (`isActive = true`, incremented `version`)
- `400 Bad Request` — `DEMAND_001`
- `403 Forbidden` — `AUTH_002`

**Events emitted**: none

---

### GET /intake/scoring-models/active
Get the currently active scoring model with its criteria.

**Permission**: EPMO Director, Portfolio Manager

**Responses**:
- `200 OK` — `ScoringModelDTO`
- `404 Not Found` — `DEMAND_003` (no active scoring model configured)
- `403 Forbidden` — `AUTH_002`

---

## Scoring (US-030)

### POST /intake/requests/:id/score
Enter per-criterion raw scores for a demand request and compute the weighted total. Upserts the
single `ScoreCard` for the request (one card per request, D3-3), replacing its criterion scores.
Permitted only while the request is in `Screening` or `Evaluation` (D3-5).

**Permission**: EPMO Director, Portfolio Manager

**Request body**:
```json
{
  "scores": [
    { "criterionId": "uuid", "rawScore": 90 },
    { "criterionId": "uuid", "rawScore": 70 },
    { "criterionId": "uuid", "rawScore": 40 }
  ]
}
```

**Validation** (Zod — `ScoreAndRank`):
- `scores`: array, min length 1, required; each:
  - `criterionId`: UUID, required (must belong to the active model — else `DEMAND_004`)
  - `rawScore`: int, ≥ 0, required (must be `≤ maxScore` of the criterion — else `DEMAND_004`)

**Responses**:
- `200 OK` — `ScoreCardDTO` (with computed `weightedTotal` in `[0, 100]`)
- `400 Bad Request` — `DEMAND_001` (malformed body) or `DEMAND_004` (criterion not in active model / raw score out of range)
- `404 Not Found` — `DEMAND_002` (request not found) or `DEMAND_003` (no active scoring model)
- `409 Conflict` — `DEMAND_007` (request not in a scorable status — not `Screening`/`Evaluation`)
- `403 Forbidden` — `AUTH_002`

**Events emitted**: none

---

## Stage Gate (US-031)

### POST /intake/requests/:id/advance
Advance the request one gate forward along the fixed linear sequence
`Submitted → Screening → Evaluation → Approved` (D3-4). Requires the per-gate permission for the
target transition. On the final approve (`Evaluation → Approved`) sets `status = Approved`.

**Permission**: Portfolio Manager (also EPMO Director) — plus the per-gate permission for the
target: `intake-gate:screening`, `intake-gate:evaluation`, or `intake-gate:approval`.

**Request body**: `{}` (empty)

**Validation** (Zod — `AdvanceGate`): empty object.

**Responses**:
- `200 OK` — `DemandRequestDTO` (new `currentGate` / `status`)
- `404 Not Found` — `DEMAND_002` (request not found)
- `409 Conflict` — `DEMAND_005` (illegal transition — terminal state or out-of-sequence; state unchanged, P3)
- `403 Forbidden` — `AUTH_002` (missing role or per-gate permission)

**Events emitted**: `demand-intake.demand.approved` `{ demandId }` — only on the final approve
(`Evaluation → Approved`).

---

### POST /intake/requests/:id/reject
Reject the request at its current active gate. Sets `status = Rejected` + `rejectionReason`
(terminal). Allowed from any active gate.

**Permission**: Portfolio Manager (also EPMO Director)

**Request body**:
```json
{ "reason": "Insufficient strategic alignment for this cycle" }
```

**Validation** (Zod — `RejectGate`):
- `reason`: string, 1–2000 chars, required

**Responses**:
- `200 OK` — `DemandRequestDTO` (`status = Rejected`)
- `400 Bad Request` — `DEMAND_001` (missing reason)
- `404 Not Found` — `DEMAND_002` (request not found)
- `409 Conflict` — `DEMAND_005` (already terminal — `Rejected` or `Promoted`; state unchanged, P3)
- `403 Forbidden` — `AUTH_002`

**Events emitted**: `demand-intake.demand.rejected` `{ demandId, reason }`

---

## Promotion (US-032)

### POST /intake/requests/:id/promote
Promote an approved demand into an execution Project. Requires `status = Approved`. Accepts the
promotion params the intake form lacks; publishes `demand-intake.demand.promoted` and sets
`status = Promoted` (terminal). The `name` defaults from the demand `title` (D3-2). Safe to
retry — `project-execution` dedupes by `sourceDemandId`.

**Permission**: Portfolio Manager (also EPMO Director)

**Request body**:
```json
{
  "portfolioId": "uuid",
  "programId": "uuid",
  "plannedStart": "2026-09-01",
  "plannedEnd": "2027-03-31",
  "plannedBudget": 750000.00
}
```

**Validation** (Zod — `PromoteToProject`):
- `portfolioId`: UUID, required
- `programId`: UUID, optional/nullable
- `plannedStart`: ISO date (`YYYY-MM-DD`), required
- `plannedEnd`: ISO date (`YYYY-MM-DD`), required, `≥ plannedStart`
- `plannedBudget`: number, ≥ 0, optional/nullable

**Responses**:
- `200 OK` — `DemandRequestDTO` (`status = Promoted`)
- `400 Bad Request` — `DEMAND_001` (missing/invalid promotion param)
- `404 Not Found` — `DEMAND_002` (request not found)
- `409 Conflict` — `DEMAND_006` (request not in `Approved` status)
- `403 Forbidden` — `AUTH_002`

**Events emitted**: `demand-intake.demand.promoted` — **exact `project-execution`
`DemandPromotedPayload` contract**:
```json
{
  "demandId": "uuid",
  "name": "Customer Self-Service Portal",
  "portfolioId": "uuid",
  "programId": "uuid",
  "plannedStart": "2026-09-01",
  "plannedEnd": "2027-03-31",
  "plannedBudget": 750000.00
}
```
`programId` and `plannedBudget` are optional (`undefined` / `null` when omitted); `name` is the
demand `title`. `project-execution` creates the Project idempotently with
`sourceDemandId = demandId`.

---

## DTOs

### DemandRequestDTO
```typescript
{
  id: string;
  title: string;
  sponsor: string;
  description: string;
  expectedValue: number | null;
  status: 'Submitted' | 'Screening' | 'Evaluation' | 'Approved' | 'Promoted' | 'Rejected';
  currentGate: 'Submitted' | 'Screening' | 'Evaluation' | 'Approved';
  rejectionReason: string | null;
  submittedBy: string;
  submittedAt: string;          // ISO datetime
  promotedProjectId: string | null;   // soft ref to execution.project (best-effort)
  createdAt: string;
  updatedAt: string;
}
```

### ScoringModelDTO
```typescript
{
  id: string;
  name: string;
  version: number;
  isActive: boolean;
  createdBy: string;
  criteria: ScoringCriterionDTO[];
  createdAt: string;
  updatedAt: string;
}
```

### ScoringCriterionDTO
```typescript
{
  id: string;
  scoringModelId: string;
  name: string;
  weight: number;
  maxScore: number;
  goalId: string | null;   // soft ref to strategy.strategic_goal (traceability only)
  sortOrder: number;
}
```

### ScoreCardDTO
```typescript
{
  id: string;
  demandRequestId: string;
  scoringModelId: string;   // soft ref to the scored model version
  weightedTotal: number;    // 0..100
  scores: { criterionId: string; rawScore: number }[];
  scoredBy: string;
  scoredAt: string;
  createdAt: string;
  updatedAt: string;
}
```

### RankedDemandDTO
```typescript
{
  demandRequestId: string;
  title: string;
  status: 'Submitted' | 'Screening' | 'Evaluation' | 'Approved' | 'Promoted' | 'Rejected';
  weightedTotal: number;
  rank: number;            // 1-based; descending weightedTotal, stable tie-break by submittedAt asc
  submittedAt: string;
}
```

---

## Error Codes

| Code | HTTP | Meaning |
|------|------|---------|
| `DEMAND_001` | 400 | Validation error (field-level detail in `errors[]`) |
| `DEMAND_002` | 404 | Demand request not found (or record-scope denied — info hiding) |
| `DEMAND_003` | 404 | Scoring model not found / no active scoring model configured |
| `DEMAND_004` | 400 | Invalid score (criterion not in active model, or raw score out of `[0, maxScore]`) |
| `DEMAND_005` | 409 | Illegal stage-gate transition (out-of-sequence or terminal state; state unchanged) |
| `DEMAND_006` | 409 | Demand not in `Approved` status — cannot promote |
| `DEMAND_007` | 409 | Demand not in a scorable status (not `Screening` / `Evaluation`) |
| `AUTH_001` | 401 | Unauthenticated |
| `AUTH_002` | 403 | Insufficient permission (role or per-gate) or record-scope denied |
| `NOT_FOUND` | 404 | Resource not found (generic) |
| `INTERNAL` | 500 | Unexpected server error |

All error responses use `application/problem+json` (RFC 7807): `type`, `title`, `status`,
`detail`, `instance`, plus a `code` member and, for `DEMAND_001`, an `errors[]` array of
field-level issues.
