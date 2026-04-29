# Migration Note for AI Context Docs

This note records the intended scope of the documents in `docs/ai-context/`.

## Purpose

The files in this directory are a current-stage context baseline for the `feishu-bridge` repository. They help explain the repository reading order, workflow governance direction, task entrypoints, and current-state audit.

They are not intended to be a permanent source of truth for every future architecture.

## Current Documents

```text
README.md
workflow-governance-map.md
implementation-roadmap.md
task-entrypoints.md
workflow-current-state.md
```

## Migration Consideration

If the repository later introduces a new runtime, harness, workflow engine, or migration directory, these documents should be treated as pre-migration background rather than final architecture.

Examples of future higher-level migration material may include:

```text
docs/migration/
docs/harness/
docs/runtime/
docs/agent-os/
```

## Conflict Handling

When these current-stage notes conflict with newer migration material or current implementation, maintainers should compare:

1. the latest architecture or migration notes;
2. the current implementation;
3. the older `docs/ai-context/` baseline.

The goal is to avoid applying old workflow assumptions to a newer system after migration.

## Practical Summary

Use `docs/ai-context/` as the current governance baseline before migration. During migration, use it as background. After migration, either update it, archive it, or mark it as superseded.
