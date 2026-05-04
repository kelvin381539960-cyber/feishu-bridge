# Workflow Plugin Ownership

## P6 scope

P6 introduces an execution plugin boundary for workflows without changing P3 replay behavior.

## Research workflow ownership

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
