# Workflow Governance

This directory contains the workflow-governance reform materials for `feishu-bridge`.

It is separate from `docs/ai-context/`:

- `docs/ai-context/` explains how AI assistants should enter and read the repository.
- `docs/workflow-governance/` contains the actual governance design, roadmap, task entry rules, and current-state audit for Cursor / OpenClaw / Agent / Harness work.

## Current Recommended Entrypoint

Start here:

```text
architecture-adjustment-v2.md
```

`architecture-adjustment-v2.md` is the current recommended interpretation of the reform plan. It updates the earlier design by making the **Forecast Layer** explicit.

The current core architecture is:

```text
User Request
  -> Intent / Attention Router
  -> PM Agent / Planner
  -> Forecast Layer
  -> Task List
  -> Context Pack
  -> Executor Agent
  -> Gate
  -> Harness / Runtime Boundary
  -> Run Trace
  -> Result Policy
```

## Documents

| File | Purpose |
|---|---|
| `architecture-adjustment-v2.md` | Current recommended v2 architecture. Adds Forecast Layer and revises schema/gate direction. |
| `workflow-governance-map.md` | Defines the relationship between PM Agent, Task List, Context Pack, Gate, Run Trace, Harness, and Result Policy. |
| `implementation-roadmap.md` | Defines the phased implementation plan for workflow governance. |
| `task-entrypoints.md` | Defines how different task types should enter the workflow. |
| `workflow-current-state.md` | Records the current-state audit before changing runtime code. |

## Boundary

These documents describe the current workflow-governance reform baseline. If a future migration introduces `docs/migration/`, `docs/harness/`, `docs/runtime/`, or another higher-level architecture source, treat this directory as pre-migration background unless explicitly updated.

## Practical Reading Order

For workflow-governance reform work, read in this order:

```text
1. docs/ai-context/README.md
2. docs/ai-context/00-migration-note.md
3. docs/workflow-governance/README.md
4. docs/workflow-governance/architecture-adjustment-v2.md
5. docs/workflow-governance/workflow-current-state.md
6. docs/workflow-governance/implementation-roadmap.md
7. docs/workflow-governance/task-entrypoints.md
8. docs/workflow-governance/workflow-governance-map.md
```
