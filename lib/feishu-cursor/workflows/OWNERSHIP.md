# Workflow Plugin Ownership

## P6 acceptance scope

P6 is accepted only as **Research execute dispatch pluginization**.

It must not be described as full research lifecycle decoupling. The accepted P6 boundary is:

- `ResearchWorkflowPlugin` owns choosing the research execute runner;
- `pipeline-v2.js` continues to own lifecycle state and replay-visible side effects;
- P3 replay order must remain unchanged.

## Research execute ownership

`ResearchWorkflowPlugin` owns only the **research execute dispatch decision**:

- choose `runResearchWorkflowV2` when research V2 is enabled or policy requires multi-agent;
- choose `runSpecializedSoloWithTrace` for specialized research execute fallback;
- choose adhoc OpenClaw gateway execution for non-specialized research execute fallback.

## Pipeline-owned lifecycle

The following lifecycle behavior intentionally remains in `pipeline-v2.js` for P6:

- clarify-first state machine;
- clarify continuation;
- end-task short circuit;
- fresh reset evaluation;
- failed research snapshot persistence;
- doc export, reply send, memory persist, and telemetry ordering.

This is deliberate: P6 is an **execution plugin** phase, not a full lifecycle plugin phase. Moving lifecycle ownership requires a later phase with replay fixtures dedicated to state-machine migration.

## P7 migration note

Keep this file through P7 planning. P7 must explicitly define which lifecycle responsibilities move from `pipeline-v2.js` into workflow plugins, and must add replay fixtures for every moved responsibility before changing ownership.

## Plugin registry order contract

Workflow plugins are registered as entries:

```js
{
  id: string,
  workflow: string,
  priority: integer,
  order: integer,
  plugin: WorkflowPlugin
}
```

Selection is deterministic:

1. lower `priority` runs first;
2. when priority ties, lower `order` runs first;
3. the first plugin whose `match(ctx)` returns true is selected.

## Result contract

Every workflow plugin `run(ctx)` returns:

```js
{
  type: "passthrough" | "override" | "error",
  result: object | null,
  meta: object,
  error: Error | null
}
```

`passthrough` means the plugin did not replace pipeline execution. `override` means the plugin produced the execution result. `error` means the plugin could not run and the pipeline should fail fast.
