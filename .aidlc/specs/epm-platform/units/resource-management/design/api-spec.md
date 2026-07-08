# API Spec — resource-management

Base path: `/api/v1`  
Auth: `Authorization: Bearer <JWT>` on all endpoints  
Error format: RFC 7807 `application/problem+json`

## Error Codes
| Code | HTTP | Meaning |
|---|---|---|
| `RESOURCE_001` | 400 | Validation failed (Zod) |
| `RESOURCE_002` | 404 | Referenced entity not found (project, pool) |
| `RESOURCE_003` | 409 | Duplicate resource email or skill name |
| `RESOURCE_004` | 422 | Over-allocation not confirmed |
| `RESOURCE_005` | 404 | Resource / allocation not found |

---

## Resource Pools

### `GET /api/v1/resource-pools`
List all pools (required before creating resources).  
**Permission**: `resource:read`  
**Response 200**:
```json
{ "data": [{ "id": "uuid", "name": "Engineering" }] }
```

### `POST /api/v1/resource-pools`
**Permission**: `resource:write` (EPMO_DIRECTOR only)  
**Body**: `{ "name": "string" }`  
**Response 201**: `{ "id": "uuid", "name": "..." }`

---

## Resources

### `POST /api/v1/resources`
**Permission**: `resource:write`  
**Body**:
```json
{
  "name": "string (1-200)",
  "email": "string (email)",
  "poolId": "uuid",
  "fteCapacity": "number (0 < x ≤ 100)",
  "skills": [{ "name": "string", "level": "Beginner|Intermediate|Expert" }]
}
```
**Response 201**: `ResourceDTO`  
**Errors**: `RESOURCE_001` (validation), `RESOURCE_002` (pool not found), `RESOURCE_003` (email duplicate)

### `GET /api/v1/resources`
**Permission**: `resource:read`  
**Query**: `poolId?`, `skill?`, `page?`, `pageSize?`  
**Response 200**: `{ data: ResourceDTO[], total, page, pageSize }`

### `GET /api/v1/resources/:id`
**Permission**: `resource:read`  
**Response 200**: `ResourceDTO` (includes skills, capacity periods)  
**Errors**: `RESOURCE_005`

### `PATCH /api/v1/resources/:id`
**Permission**: `resource:write`  
**Body**: partial of create body (skills replaced wholesale if provided)  
**Response 200**: `ResourceDTO`

### `DELETE /api/v1/resources/:id`
**Permission**: `resource:write`  
Soft-deletes if active allocations exist, hard-deletes otherwise.  
**Response 204**

---

## Allocations

### `POST /api/v1/resources/:resourceId/allocations`
**Permission**: `allocation:write`  
**Body**:
```json
{
  "projectId": "string",
  "periodStart": "YYYY-MM-DD",
  "periodEnd": "YYYY-MM-DD",
  "allocationPct": "number (0 < x ≤ 200)",
  "confirmOverAllocation": "boolean (default false)"
}
```
**Response 201**: `AllocationDTO` + `{ overAllocationWarning?: OverAllocationWarning }`  
**Errors**: `RESOURCE_001`, `RESOURCE_002` (project not found), `RESOURCE_004` (over-alloc not confirmed)

`OverAllocationWarning`:
```json
{
  "periods": [{ "month": "YYYY-MM", "totalPct": 110 }],
  "requiresConfirmation": true
}
```

### `GET /api/v1/resources/:resourceId/allocations`
**Permission**: `allocation:read`  
**Query**: `periodStart?`, `periodEnd?`  
**Response 200**: `{ data: AllocationDTO[] }`

### `PATCH /api/v1/resources/:resourceId/allocations/:id`
**Permission**: `allocation:write`  
**Body**: partial (same as create, plus `confirmOverAllocation`)  
**Response 200**: `AllocationDTO`

### `DELETE /api/v1/resources/:resourceId/allocations/:id`
**Permission**: `allocation:write`  
**Response 204**

---

## Utilization

### `GET /api/v1/resources/utilization`
**Permission**: `utilization:read`  
**Query**: `poolId?`, `from=YYYY-MM-DD`, `to=YYYY-MM-DD` (required, max 12 months)  
**Response 200**:
```json
{
  "from": "2026-08",
  "to": "2027-07",
  "rows": [
    {
      "resourceId": "uuid",
      "resourceName": "Alice",
      "poolId": "uuid",
      "periods": [
        { "month": "2026-08", "allocatedPct": 80, "band": "Optimal" }
      ]
    }
  ]
}
```

Utilization bands: `Under` (<80%), `Optimal` (80–100%), `Over` (>100%)

---

## Capacity vs Demand

### `GET /api/v1/resources/capacity-demand`
**Permission**: `capacity:read`  
**Query**: `from=YYYY-MM-DD`, `to=YYYY-MM-DD` (required, max 12 months), `poolId?`, `skill?`  
**Response 200**:
```json
{
  "from": "2026-08",
  "to": "2027-07",
  "summary": [
    {
      "month": "2026-08",
      "poolId": "uuid",
      "poolName": "Engineering",
      "totalCapacityPct": 400,
      "totalAllocatedPct": 350,
      "gapPct": 50,
      "shortfall": false
    }
  ]
}
```

---

## DTOs

### `ResourceDTO`
```json
{
  "id": "uuid",
  "name": "string",
  "email": "string",
  "poolId": "uuid",
  "poolName": "string",
  "fteCapacity": 100,
  "overAllocated": false,
  "skills": [{ "id": "uuid", "name": "React", "level": "Expert" }],
  "capacityPeriods": [{ "id": "uuid", "periodStart": "2026-08-01", "capacityPct": 80 }],
  "createdAt": "ISO8601",
  "updatedAt": "ISO8601"
}
```

### `AllocationDTO`
```json
{
  "id": "uuid",
  "resourceId": "uuid",
  "projectId": "string",
  "periodStart": "2026-08-01",
  "periodEnd": "2027-01-01",
  "allocationPct": 50,
  "overAllocatedConfirmed": false,
  "createdBy": "string",
  "createdAt": "ISO8601",
  "updatedAt": "ISO8601"
}
```
