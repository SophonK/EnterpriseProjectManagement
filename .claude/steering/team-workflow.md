---
inclusion: always
---
# Team Workflow — AI-DLC Multi-Developer Coordination

## Summary
- **Model**: Tech Lead + Developers (1 lead + 2 developers total)
- **Tech Lead**: Sophon
- **Git remote**: https://github.com/SophonK/EnterpriseProjectManagement.git
- **Sync Method**: Git-based + Manifest as single source of truth
- **Conflict Resolution**: Tech Lead owns shared phases, Developers own unit phases
- **Communication**: Steering files + PR reviews + regular sync

---

## 1. Roles & Responsibilities

### Tech Lead — Sophon (owner of the overall picture)

| Responsibility | AI-DLC Phase | Rights |
|----------------|--------------|--------|
| Context assessment | `aidlc-context` | Create + approve |
| Planning sign-off | `aidlc-plan` | Answer DP + approve |
| Requirements sign-off | `aidlc-requirements` | Answer D1 + approve final |
| Decomposition & unit assignment | `aidlc-decomposition` | Answer D2 + assign units |
| Foundation conventions | `aidlc-foundation` | Answer DF + approve |
| Solutions review | `aidlc-solutions-review` | Run + resolve conflicts |
| Final code review | `aidlc-code-review` | Approve merge to main |
| Manifest ownership | `aidlc-manifest.yaml` | Only person who writes shared phases + `state.*` |
| Steering file updates | `.claude/steering/*.md` | Approve changes (via PR) |
| Conflict resolution | — | Final decision on design conflicts |
| Merge order decision | — | Which unit PRs merge first |

### Developers (2 devs — each owns their assigned unit)

| Responsibility | AI-DLC Phase | Rights |
|----------------|--------------|--------|
| Unit design | `aidlc-design` (scoped to unit) | Answer D3 + create design docs |
| Unit task planning | `aidlc-tasks` (scoped to unit) | Answer D4 + create tasks |
| Unit implementation | `aidlc-implement` | Write code + tests |
| Unit self-review | — | Review own code before PR |
| Cross-unit review | — | Review others' PRs (when Tech Lead assigns) |

### Unit Ownership

| Unit | Owner | Branch |
|------|-------|--------|
| foundation | Sophon | `feature/epm-platform/unit-foundation` |
| identity-access | Sophon | `feature/epm-platform/unit-identity-access` |
| strategy-portfolio | Sophon | `feature/epm-platform/unit-strategy-portfolio` |
| project-execution | Chavakorn | `feature/epm-platform/unit-project-execution` |
| resource-management | Chavakorn | `feature/epm-platform/unit-resource-management` |
| risk-raid | Chavakorn | `feature/epm-platform/unit-risk-raid` |
| demand-intake | Sophon | `feature/epm-platform/unit-demand-intake` |
| reporting-dashboards | Chavakorn | `feature/epm-platform/unit-reporting-dashboards` |

---

## 2. Workflow Sequence (Who Does What, When)

```
Phase            │ Who        │ Action                                 │ Artifact
─────────────────┼────────────┼────────────────────────────────────────┼──────────────────────
context          │ Sophon     │ Run aidlc-context                      │ context.md, steering/*
plan             │ Sophon     │ Run aidlc-plan (DP)                    │ plan.md
requirements     │ Sophon     │ Run aidlc-requirements                 │ requirements.md, personas.md
decomposition    │ Sophon     │ Run aidlc-decomposition + assign units │ units.md, manifest units[]
foundation       │ Sophon     │ Run aidlc-foundation                   │ foundation.md, team-workflow.md
design           │ Each Dev   │ Branch per unit, run aidlc-design      │ units/{unit}/design/*
solutions-review │ Sophon     │ Run aidlc-solutions-review (2+ designs)│ review report
tasks            │ Each Dev   │ Run aidlc-tasks (own unit)             │ units/{unit}/tasks.md
implement        │ Each Dev   │ Run aidlc-implement (own unit)         │ source + tests
code-review      │ Sophon     │ Review PRs + aidlc-code-review         │ merge to main
```

---

## 3. Git Strategy

### Branch Model
```
main ─────────────────────────────────────────────────────────────
  │ (Sophon: shared phases on main)          ▲ PR        ▲ PR
  ├── feature/epm-platform/unit-{name} ───────┘           │
  └── feature/epm-platform/unit-{name} ───────────────────┘
```
Remote: https://github.com/SophonK/EnterpriseProjectManagement.git

### Rules
| Rule | Reason |
|------|--------|
| Shared phase artifacts (`context.md`, `plan.md`, `requirements.md`, `units.md`, `foundation.md`) → **only on main** by Sophon | One owner prevents conflicts |
| Unit artifacts (`.aidlc/specs/epm-platform/units/{unit}/`) → **on feature branch** by assigned dev | Isolated work per unit |
| Steering files (`.claude/steering/`) → **changes via PR** approved by Sophon | Shared conventions need agreement |
| Manifest → **Sophon writes shared phases + `state.*`; devs write only their unit section** | Minimizes merge conflicts |
| Shared packages (`packages/shared`, `packages/db`, `packages/config`) → PR approved by Sophon | Cross-cutting impact |
| PR merge order: foundation first → identity-access → independent units in dependency order | Respects dependency graph |
| `@epm/shared` changes → SemVer bump + Sophon approval (backend↔web contract) | Prevents cross-repo drift |

### Merge Conflict Prevention
Each developer edits only their own `units[]` section in the manifest, so Git merge conflicts are rare. Acquire the `.lock` file before any manifest write.

---

## 4. Session Prompts

### Tech Lead (Sophon) — start
```
resume
I am the Tech Lead (Sophon) overseeing epm-platform.
- show status of all units
- check which units are ready for solutions review
- recommend the next action
```

### Developer (Chavakorn) — start
```
resume
I am Chavakorn, responsible for unit: project-execution (and resource-management, risk-raid, reporting-dashboards).
Continue from the current phase. Read foundation.md and steering files first.
```

### Developer — finish unit
```
Unit {name} implementation is done.
- mark unit as completed
- summarize the changed files for the PR
```

---

## 5. Conflict Resolution

| Conflict Type | Decided by | How |
|---------------|-----------|-----|
| Differing API format | Sophon | Pick one → update foundation.md |
| Overlapping data model | Sophon + involved dev | Merge entities → update both designs |
| Import cycle between units | Sophon | Refactor boundary → update units.md |
| Shared type change (`@epm/shared`) | Sophon | Agree → SemVer bump → both update |
| Same file edited | Later PR owner | Rebase on main + resolve |

Escalation: Dev can't resolve → Sophon decides → update steering/foundation if systemic.

---

## 6. Manifest Ownership

- **Tech Lead only (Sophon)**: `version`, `feature`, `state.*`, `extensions`, `artifacts.{context,plan,requirements,decomposition,foundation}`, `decisions.*`, and `units[].owner`.
- **Assigned developer**: their own `units[i]` fields (`status`, `phase`, `completedPhases`, `implementationMode`, `implementation`, `artifacts`, `decisions`).
- Never edit another developer's unit section. Every write acquires `.lock` first.

---

## 7. Definition of Done (per unit)
- [ ] Design approved (dev + Sophon sign-off)
- [ ] Tasks complete (all checkboxes)
- [ ] All tests pass (incl. property-based tests where required)
- [ ] No lint errors
- [ ] PR created with description
- [ ] Code review passed
- [ ] Merged to main (rebased, dependency order respected)
- [ ] Manifest updated: unit `status = "completed"`

---

## 8. Quick Reference

| Want to | Who | Prompt |
|---------|-----|--------|
| See status | Anyone | `status` |
| Start working a unit | Assigned dev | `resume` + name the unit |
| Review designs | Sophon | `review` |
| Fix a conflict | Sophon | `rollback to [phase]` + fix |
| Unit done | Dev | mark complete + create PR |
