# Workflow Governance

This directory contains the workflow-governance reform materials for `feishu-bridge`.

It is separate from `docs/ai-context/`:

- `docs/ai-context/` explains how AI assistants should enter and read the repository.
- `docs/workflow-governance/` contains the actual governance design, roadmap, task entry rules, and current-state audit for Cursor / OpenClaw / Agent / Harness work.

## Documents

| File | Purpose |
|---|---|
| `workflow-governance-map.md` | Defines the relationship between PM Agent, Task List, Context Pack, Gate, Run Trace, Harness, and Result Policy. |
| `implementation-roadmap.md` | Defines the phased implementation plan for workflow governance. |
| `task-entrypoints.md` | Defines how different task types should enter the workflow. |
| `workflow-current-state.md` | Records the current-state audit before changing runtime code. |

## Boundary

These documents describe the current workflow-governance reform baseline. If a future migration introduces `docs/migration/`, `docs/harness/`, `docs/runtime/`, or another higher-level architecture source, treat this directory as pre-migration background unless explicitly updated.
