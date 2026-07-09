// @epm/shared — risk-raid domain event types and constants.

export const RISK_RAID_EVENTS = {
  RAID_LOGGED:         "risk-raid.raid.logged",
  RISK_ESCALATED:      "risk-raid.risk.escalated",
  DEPENDENCY_LINKED:   "risk-raid.dependency.linked",
} as const;

export type RiskRaidEventType = (typeof RISK_RAID_EVENTS)[keyof typeof RISK_RAID_EVENTS];

export interface RaidLoggedPayload {
  raidItemId: string;
  projectId: string;
  type: string;
  title: string;
  riskScore: number | null;
  escalated: boolean;
}

export interface RiskEscalatedPayload {
  raidItemId: string;
  projectId: string;
  riskScore: number;
  threshold: number;
  ownerUserId: string | null;
}

export interface DependencyLinkedPayload {
  dependencyId: string;
  fromProjectId: string;
  toProjectId: string;
  dependencyType: string;
}
