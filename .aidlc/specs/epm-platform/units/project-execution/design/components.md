# Components — project-execution

## Module Overview

```
ProjectExecutionModule (NestJS)
├── ProjectController          REST adapter — /api/v1/projects/**
├── MilestoneController        REST adapter — /api/v1/projects/:id/milestones/**
├── ProjectService             Command handler + domain logic
├── RollupService              Recomputes program/portfolio roll-up
├── ProjectRepository          Prisma — execution.project
├── MilestoneRepository        Prisma — execution.milestone
├── StatusUpdateRepository     Prisma — execution.status_update
└── ProjectExecutionEventSub   Subscribes to: demand-intake.DemandPromoted
```

## Component Interfaces

### ProjectService

```typescript
interface IProjectService {
  createProject(cmd: CreateProjectCommand, ctx: AuthContext): Promise<ProjectDTO>;
  updateProject(id: string, cmd: UpdateProjectCommand, ctx: AuthContext): Promise<ProjectDTO>;
  archiveProject(id: string, ctx: AuthContext): Promise<void>;
  getProject(id: string, ctx: AuthContext): Promise<ProjectDTO>;
  listProjects(filter: ProjectFilter, ctx: AuthContext): Promise<ProjectListDTO>;
  updateStatusHealth(id: string, cmd: UpdateStatusHealthCommand, ctx: AuthContext): Promise<StatusUpdateDTO>;
  getStatusHistory(id: string, ctx: AuthContext): Promise<StatusUpdateDTO[]>;
}
```

### MilestoneService

```typescript
interface IMilestoneService {
  addMilestone(projectId: string, cmd: AddMilestoneCommand, ctx: AuthContext): Promise<MilestoneDTO>;
  updateMilestone(id: string, cmd: UpdateMilestoneCommand, ctx: AuthContext): Promise<MilestoneDTO>;
  deleteMilestone(id: string, ctx: AuthContext): Promise<void>;
  listMilestones(projectId: string, ctx: AuthContext): Promise<MilestoneDTO[]>;
}
```

### RollupService (internal)

```typescript
interface IRollupService {
  recomputeRollup(programId: string | null, portfolioId: string): Promise<RollupSummaryDTO>;
}
```

### ProjectQueryService (read-side — consumed by reporting-dashboards)

```typescript
interface IProjectQueryService {
  getPortfolioRollup(portfolioId: string, ctx: AuthContext): Promise<PortfolioRollupDTO>;
  getAtRiskProjects(portfolioId: string, ctx: AuthContext): Promise<ProjectDTO[]>;
}
```

## In-Process API (consumed by other units)

`ProjectExecutionModule` exports `ProjectService` and `ProjectQueryService` as NestJS providers. Downstream units inject these directly — no HTTP hop.

```typescript
// Public in-process API exposed from this module
export { IProjectService, IProjectQueryService, ProjectDTO, RollupSummaryDTO };
```

## Domain Events

### Published
| Event | Payload | Trigger |
|-------|---------|---------|
| `project-execution.project.created` | `{ projectId, portfolioId, programId?, name }` | CreateProject command |
| `project-execution.project.status-changed` | `{ projectId, portfolioId, programId?, health, status }` | UpdateStatusHealth command |
| `project-execution.milestone.overdue` | `{ milestoneId, projectId, dueDate }` | Overdue check on read |
| `project-execution.rollup.recomputed` | `{ portfolioId, programId?, summary: RollupSummary }` | RollupService |

### Subscribed
| Event | Source | Handler |
|-------|--------|---------|
| `demand-intake.demand.promoted` | demand-intake | Create project from promoted demand |

## Permission Matrix

| Action | EPMO Director | Portfolio Manager | Project Manager | Others |
|--------|:---:|:---:|:---:|:---:|
| Create project | ✅ | ✅ | ✅ (own scope) | ❌ |
| Read project (scoped) | ✅ (all) | ✅ (portfolio) | ✅ (assigned) | ❌ |
| Update project | ✅ | ✅ (portfolio) | ✅ (own) | ❌ |
| Archive project | ✅ | ✅ (portfolio) | ❌ | ❌ |
| Add/update milestone | ✅ | ❌ | ✅ (own) | ❌ |
| Update status/health | ✅ | ✅ (portfolio) | ✅ (own) | ❌ |
| View roll-up | ✅ | ✅ | ✅ (own) | ❌ |
