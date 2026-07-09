# Components — resource-management

## Module: ResourceManagementModule

**NestJS module** at `apps/api/src/modules/resource-management/`

### Controllers (HTTP boundary)
| Controller | Route prefix | Responsibility |
|---|---|---|
| `ResourceController` | `POST /api/v1/resources`, `GET/PATCH/DELETE /api/v1/resources/:id`, `GET /api/v1/resources` | Resource CRUD |
| `AllocationController` | `POST /api/v1/resources/:resourceId/allocations`, `GET/PATCH/DELETE /api/v1/resources/:resourceId/allocations/:id` | Allocation CRUD |
| `UtilizationController` | `GET /api/v1/resources/utilization` | Utilization heatmap read |
| `CapacityController` | `GET /api/v1/resources/capacity-demand` | Capacity-vs-demand read |

### Services (domain logic)
| Service | Exported | Responsibility |
|---|---|---|
| `ResourceService` | Yes | Create/update/delete resources; manage skills and capacity periods |
| `AllocationService` | Yes | Allocate/update/delete; over-allocation check; confirm override |
| `UtilizationService` | Yes | Compute utilization per resource/period; apply banding |
| `CapacityService` | Yes | Compute capacity-vs-demand gap per pool/skill/period |

### Repositories (data access)
| Repository | Schema | Responsibility |
|---|---|---|
| `ResourceRepository` | `resource` | CRUD on `resource.resource` + `resource.skill` |
| `AllocationRepository` | `resource` | CRUD on `resource.allocation`; overlap sum query |
| `CapacityPeriodRepository` | `resource` | CRUD on `resource.capacity_period` |

### Event Subscriber
| Class | Listens to | Action |
|---|---|---|
| `ResourceManagementEventSub` | `project-execution.project.created` | Validates projectId reference exists (no-op if already known) |

### Shared-kernel imports
- `AuthModule` — `AuthGuard`, `RbacGuard`, `getAuth(req)`
- `AuditModule` — `AuditService`
- `EventsModule` — `EVENT_BUS`
- `DbModule` — `PrismaService`
- `ProjectService` (from `ProjectExecutionModule`) — soft-FK validation on allocation write

### RBAC grants (registered in module constructor)
| Role | Permissions |
|---|---|
| `EPMO_DIRECTOR` | `resource:read`, `resource:write`, `allocation:read`, `allocation:write`, `utilization:read`, `capacity:read` |
| `RESOURCE_MANAGER` | `resource:read`, `resource:write`, `allocation:read`, `allocation:write`, `utilization:read`, `capacity:read` |
| `PORTFOLIO_MANAGER` | `resource:read`, `allocation:read`, `utilization:read`, `capacity:read` |
| `PROGRAM_MANAGER` | `resource:read`, `allocation:read`, `utilization:read` |
| `PROJECT_MANAGER` | `resource:read`, `allocation:read` |
| `EXECUTIVE_SPONSOR` | `resource:read`, `utilization:read`, `capacity:read` |

### Record scoping
- `EPMO_DIRECTOR` — sees all pools
- `RESOURCE_MANAGER` — scoped to `poolId` values in `AuthContext.recordScopes`
- Other roles — read-only; scoped to projects they have access to (via allocation join)
