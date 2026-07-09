-- Migration 0008: risk-raid unit — creates risk schema with raid_item and dependency tables.

CREATE SCHEMA IF NOT EXISTS risk;

CREATE TABLE risk.raid_item (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    TEXT        NOT NULL,
  type          TEXT        NOT NULL,
  title         TEXT        NOT NULL,
  description   TEXT,
  severity      SMALLINT    CHECK (severity BETWEEN 1 AND 5),
  probability   SMALLINT    CHECK (probability BETWEEN 1 AND 5),
  risk_score    SMALLINT,
  status        TEXT        NOT NULL DEFAULT 'Open',
  escalated     BOOLEAN     NOT NULL DEFAULT FALSE,
  owner_user_id TEXT,
  mitigation    TEXT,
  closed_by     TEXT,
  closed_at     TIMESTAMPTZ,
  created_by    TEXT        NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT raid_item_type_check   CHECK (type   IN ('Risk','Assumption','Issue','Dependency')),
  CONSTRAINT raid_item_status_check CHECK (status IN ('Open','InProgress','Resolved','Closed','Accepted','Rejected')),
  CONSTRAINT raid_item_risk_fields  CHECK (
    (type = 'Risk' AND severity IS NOT NULL AND probability IS NOT NULL)
    OR type != 'Risk'
  )
);

CREATE INDEX idx_raid_item_project   ON risk.raid_item (project_id);
CREATE INDEX idx_raid_item_escalated ON risk.raid_item (escalated) WHERE escalated = TRUE;
CREATE INDEX idx_raid_item_status    ON risk.raid_item (status);

CREATE TABLE risk.dependency (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  from_project_id TEXT        NOT NULL,
  to_project_id   TEXT        NOT NULL,
  description     TEXT        NOT NULL,
  dependency_type TEXT        NOT NULL DEFAULT 'DependsOn',
  created_by      TEXT        NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT dependency_type_check    CHECK (dependency_type IN ('DependsOn','Blocks','FinishToStart')),
  CONSTRAINT dependency_no_self_loop  CHECK (from_project_id != to_project_id),
  CONSTRAINT uq_dependency_pair       UNIQUE (from_project_id, to_project_id)
);

CREATE INDEX idx_dependency_from ON risk.dependency (from_project_id);
CREATE INDEX idx_dependency_to   ON risk.dependency (to_project_id);
