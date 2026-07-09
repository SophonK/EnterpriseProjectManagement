# risk-raid — Data Model

## Schema: `risk`

### Tables

#### `raid_item`
```sql
CREATE TABLE risk.raid_item (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      TEXT NOT NULL,                  -- soft FK to execution.project
  type            TEXT NOT NULL,                  -- Risk | Assumption | Issue | Dependency
  title           TEXT NOT NULL,
  description     TEXT,
  severity        SMALLINT CHECK (severity BETWEEN 1 AND 5),
  probability     SMALLINT CHECK (probability BETWEEN 1 AND 5),
  risk_score      SMALLINT GENERATED ALWAYS AS (
                    CASE WHEN severity IS NOT NULL AND probability IS NOT NULL
                    THEN severity * probability ELSE NULL END
                  ) STORED,
  status          TEXT NOT NULL DEFAULT 'Open',   -- Open | InProgress | Resolved | Closed | Accepted | Rejected
  escalated       BOOLEAN NOT NULL DEFAULT FALSE,
  owner_user_id   TEXT,
  mitigation      TEXT,
  closed_by       TEXT,
  closed_at       TIMESTAMPTZ,
  created_by      TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT raid_item_type_check CHECK (type IN ('Risk','Assumption','Issue','Dependency')),
  CONSTRAINT raid_item_status_check CHECK (status IN ('Open','InProgress','Resolved','Closed','Accepted','Rejected')),
  CONSTRAINT raid_item_risk_fields CHECK (
    (type = 'Risk' AND severity IS NOT NULL AND probability IS NOT NULL)
    OR type != 'Risk'
  )
);

CREATE INDEX raid_item_project_idx ON risk.raid_item (project_id);
CREATE INDEX raid_item_escalated_idx ON risk.raid_item (escalated) WHERE escalated = TRUE;
CREATE INDEX raid_item_status_idx ON risk.raid_item (status);
```

#### `dependency`
```sql
CREATE TABLE risk.dependency (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_project_id   TEXT NOT NULL,               -- soft FK
  to_project_id     TEXT NOT NULL,               -- soft FK
  description       TEXT NOT NULL,
  dependency_type   TEXT NOT NULL DEFAULT 'DependsOn',  -- DependsOn | Blocks | FinishToStart
  created_by        TEXT NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT dependency_type_check CHECK (dependency_type IN ('DependsOn','Blocks','FinishToStart')),
  CONSTRAINT dependency_no_self_loop CHECK (from_project_id != to_project_id),
  CONSTRAINT dependency_unique UNIQUE (from_project_id, to_project_id)
);

CREATE INDEX dependency_from_idx ON risk.dependency (from_project_id);
CREATE INDEX dependency_to_idx ON risk.dependency (to_project_id);
```

## Prisma Models

```prisma
model RaidItem {
  id          String    @id @default(uuid())
  projectId   String
  type        String    // Risk | Assumption | Issue | Dependency
  title       String
  description String?
  severity    Int?
  probability Int?
  riskScore   Int?      // computed: severity * probability
  status      String    @default("Open")
  escalated   Boolean   @default(false)
  ownerUserId String?
  mitigation  String?
  closedBy    String?
  closedAt    DateTime?
  createdBy   String
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  @@index([projectId])
  @@index([escalated])
  @@index([status])
  @@map("raid_item")
  @@schema("risk")
}

model Dependency {
  id             String   @id @default(uuid())
  fromProjectId  String
  toProjectId    String
  description    String
  dependencyType String   @default("DependsOn")
  createdBy      String
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  @@unique([fromProjectId, toProjectId])
  @@index([fromProjectId])
  @@index([toProjectId])
  @@map("dependency")
  @@schema("risk")
}
```

## Notes

- `riskScore` is **not** a Prisma generated column; it is computed at the service layer (`severity * probability`) and persisted as a regular integer. Prisma does not support `GENERATED ALWAYS AS … STORED` natively — the service sets it on every write.
- `Dependency.@@unique([fromProjectId, toProjectId])` enforces that only one directional link exists per pair; the reverse-pair check (circular) is a service-layer guard.
- `closedAt` is `null` for non-terminal items; set atomically with `closedBy` when transitioning to Resolved/Closed/Accepted/Rejected.
