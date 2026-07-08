# AI-DLC Workflow Context

This project uses AI-DLC skills for structured software specification and implementation.

## Current Workflow State

- **Feature**: epm-platform
- **Phase**: foundation COMPLETED + reviewed. Now unit project-execution (owner: Chavakorn) — design (D3)
- **Language**: en

## Workflow Instructions

1. **Read manifest**: `.aidlc/workflow/epm-platform/aidlc-manifest.yaml` for current state
2. **Activate skill**: Use the skill for the current phase (see Available Skills below)
3. **Decision gates**: WAIT for user approval after each phase
4. **Steering files**: Read `.claude/steering/*.md` for persistent project context

## Available Skills

| Skill | Phase | What it does |
|---|---|---|
| aidlc-context | 1 | Workspace scan, context assessment |
| aidlc-requirements | 2 | User stories with EARS criteria |
| aidlc-plan | — | Execution plan before decomposition |
| aidlc-decomposition | 3 | Unit breakdown and foundation |
| aidlc-foundation | 3b | Shared contracts/conventions |
| aidlc-design | 4 | Technology decisions and architecture |
| aidlc-tasks | 5 | Implementation task planning |
| aidlc-implement | 6 | Code generation |
| aidlc-prototype | — | Quick throwaway prototype |

## Key Paths

- **Specs**: `.aidlc/specs/epm-platform/`
- **Workflow**: `.aidlc/workflow/epm-platform/`
- **Manifest**: `.aidlc/workflow/epm-platform/aidlc-manifest.yaml`
- **Steering**: `.claude/steering/`

## Team

- **Model**: tech-lead-devs (2–4 developers), Tech Lead/Owner: Sophon
- **Repo**: https://github.com/SophonK/EnterpriseProjectManagement.git

## After Context Compaction

1. Read `.claude/CLAUDE.md` (this file) for current state
2. Read `.aidlc/workflow/epm-platform/aidlc-manifest.yaml` for detailed state and artifact paths
3. Read steering files: `.claude/steering/product.md`, `tech.md`, `structure.md`
4. Activate the skill for the current phase
5. Resume from manifest state

## Notes

- Generate ALL content in `en` (except code, paths, tech names)
- WAIT for user approval after each phase
- Update `.claude/CLAUDE.md` after each phase completion
