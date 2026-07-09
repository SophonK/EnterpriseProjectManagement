# risk-raid — API Specification

## Error Codes

| Code | HTTP | Title |
|------|------|-------|
| RISK_001 | 400 | RAID item validation failed |
| RISK_002 | 404 | Referenced project not found |
| RISK_003 | 409 | Duplicate or circular dependency |
| RISK_004 | 404 | RAID item or dependency not found |
| RISK_005 | 422 | Invalid status transition |

## RAID Item Endpoints

### POST /api/v1/raid
Create a RAID item.

**Permission**: `raid:write`

**Body**:
```json
{
  "projectId": "uuid-string",
  "type": "Risk | Assumption | Issue | Dependency",
  "title": "string (1–300)",
  "description": "string? (max 2000)",
  "severity": "integer 1–5 (required if type=Risk)",
  "probability": "integer 1–5 (required if type=Risk)",
  "ownerId": "string?",
  "mitigation": "string?"
}
```

**Response 201**:
```json
{
  "id": "uuid",
  "projectId": "uuid-string",
  "type": "Risk",
  "title": "...",
  "severity": 4,
  "probability": 4,
  "riskScore": 16,
  "status": "Open",
  "escalated": true,
  "ownerUserId": null,
  "mitigation": null,
  "closedBy": null,
  "closedAt": null,
  "createdBy": "user-id",
  "createdAt": "ISO",
  "updatedAt": "ISO"
}
```

---

### GET /api/v1/raid
List RAID items (scoped to caller).

**Permission**: `raid:read`

**Query**: `projectId?`, `type?`, `status?`, `escalated?` (bool), `page?`, `pageSize?`

**Response 200**: `{ data: RaidItemDTO[], total, page, pageSize }`

---

### GET /api/v1/raid/:id
Get a single RAID item.

**Permission**: `raid:read`

**Response 200**: `RaidItemDTO` | 404 RISK_004

---

### PATCH /api/v1/raid/:id
Update a RAID item (owner, mitigation, status, severity, probability, title, description).

**Permission**: `raid:write`

**Body**: Partial of create fields + `status?` (for explicit status transitions), `closedBy?` (inferred from ctx.userId).

**Response 200**: Updated `RaidItemDTO`

---

### DELETE /api/v1/raid/:id
Delete a RAID item.

**Permission**: `raid:write`

**Response 204**

---

## Dependency Endpoints

### POST /api/v1/dependencies
Create a cross-project dependency link.

**Permission**: `dependency:write`

**Body**:
```json
{
  "fromProjectId": "uuid-string",
  "toProjectId": "uuid-string",
  "description": "string (1–500)",
  "dependencyType": "DependsOn | Blocks | FinishToStart"
}
```

**Response 201**: `DependencyDTO`

**Errors**: RISK_001 (self-loop or missing fields), RISK_002 (project not found), RISK_003 (circular or duplicate)

---

### GET /api/v1/dependencies
List dependencies.

**Permission**: `dependency:read`

**Query**: `projectId?` (matches fromProjectId OR toProjectId), `page?`, `pageSize?`

**Response 200**: `{ data: DependencyDTO[], total, page, pageSize }`

---

### GET /api/v1/dependencies/:id
Get a single dependency.

**Permission**: `dependency:read`

**Response 200**: `DependencyDTO` | 404 RISK_004

---

### DELETE /api/v1/dependencies/:id
Remove a dependency link.

**Permission**: `dependency:write`

**Response 204**

---

## DTOs

### `RaidItemDTO`
```typescript
interface RaidItemDTO {
  id: string;
  projectId: string;
  type: RaidType;               // 'Risk' | 'Assumption' | 'Issue' | 'Dependency'
  title: string;
  description: string | null;
  severity: number | null;
  probability: number | null;
  riskScore: number | null;
  status: RaidStatus;           // 'Open' | 'InProgress' | 'Resolved' | 'Closed' | 'Accepted' | 'Rejected'
  escalated: boolean;
  ownerUserId: string | null;
  mitigation: string | null;
  closedBy: string | null;
  closedAt: string | null;      // ISO date
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}
```

### `DependencyDTO`
```typescript
interface DependencyDTO {
  id: string;
  fromProjectId: string;
  toProjectId: string;
  description: string;
  dependencyType: DependencyType;  // 'DependsOn' | 'Blocks' | 'FinishToStart'
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}
```
