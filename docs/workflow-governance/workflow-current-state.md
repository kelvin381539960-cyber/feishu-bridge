# Workflow Current State Audit

> Phase 1 audit document. This file records current facts, gaps, and the next safe cut point. It does not change runtime code.

---

## 1. Audit Scope

This audit read and referenced these key files:

```text
AGENTS.md
package.json
feishu-ws-cursor.js
lib/feishu-channel/bridge-host.js
lib/feishu-cursor/pipeline-v2.js
lib/openclaw-control-plane/request-planner.js
lib/openclaw-control-plane/workflow-execution-policy.js
lib/feishu-cursor/task-builders/task-context-builder.js
lib/feishu-cursor/runtime/run-trace-recorder.js
docs/cursor-architecture/README.md
docs/cursor-architecture/workflow-governance-overview.md
```

Conclusion: this repository is not starting from zero. It already has a fairly complete workflow / gate / trace / specialized workflow baseline. The next step should not reinvent the entire framework, but should fill the actual runtime loop for **Task List / Context Pack / Gate Runtime / Harness Boundary**.

---

## 2. Current Runtime Chain

Current main chain:

```text
Feishu Message
  -> @larksuiteoapi WSClient
  -> feishu-ws-cursor.js
  -> lib/feishu-channel/bridge-host.js
  -> createFeishuChannelRunner()
  -> lib/feishu-cursor/pipeline-v2.js
  -> lib/openclaw-control-plane/request-planner.js
  -> policy / broker / dispatch
  -> OpenClaw Gateway
  -> normalized execution result
  -> reply / doc export / memory / chain-next
```

### Facts

1. `feishu-ws-cursor.js` is a thin entrypoint that starts `startFeishuBridgeHost()`.
2. `bridge-host.js` reads configuration, starts the Feishu WSClient, registers `im.message.receive_v1`, and hands events to the runner.
3. `pipeline-v2.js` is the current main orchestration point. It handles parse, routing, media, quoted context, mention context, planning, execution, and reply.
4. `request-planner.js` is already a control-plane facade, but it remains thin: classification -> policy -> broker.
5. `workflow-execution-policy.js` already outputs `taskSize`, `multiAgentRequired`, `agentsPlanned`, `skippedAgents`, and `decisionReason`.
6. `run-trace-recorder.js` already contains runtime trace primitives and explicitly trusts runtime records instead of LLM self-claims.

---

## 3. Existing Governance Baseline

Existing governance docs already define strong constraints:

```text
docs/cursor-architecture/README.md
docs/cursor-architecture/workflow-governance-overview.md
docs/cursor-architecture/multi-agent/*
```

### Current design facts

1. Cursor native task orchestration is designed as five layers: rules, routing, skills, persistence, tools.
2. Workflow whitelist is already converged to 5 types:

```text
prd
research
code
solution
general
```

3. Existing governance requirements include:

```text
- workflowKey whitelist
- workflowKey + taskSubtype dual fields
- pipeline gate always on
- solution L/XL requires reviewer trace
- code.execute requires executionAuthorization
- multi-agent runtime guards prevent sub-agent overreach
```

4. `package.json` already contains multiple gate / verification scripts:

```text
npm test
npm run verify:workflow
npm run verify:research
npm run verify:code
npm run verify:solution
npm run smoke:runtime
npm run scan:residue
```

### Judgment

The docs and code already point toward governance, but the system is not yet a full PM Agent / Task List / Context Pack execution system.

---

## 4. What Already Exists

| Capability | Current State | Notes |
|---|---|---|
| Feishu WS entry | exists | `feishu-ws-cursor.js` + `bridge-host.js` |
| Pipeline v2 | exists | main orchestration, heavy responsibility |
| Control Plane Facade | partial | `request-planner.js` exists but is thin |
| Workflow Classification | exists | workflowKey / taskSubtype design exists |
| Workflow Execution Policy | partial | can decide taskSize / multiAgentRequired |
| Gate Adapter | exists | pipeline already calls `applyPipelineGate()` |
| Specialized Workflow | partial | research V2 has special handling; prd/code/solution multi-agent still pending |
| Runtime Trace | partial | trace primitives exist, but no complete run log persistence loop yet |
| Task Context | exists | `task-context-builder.js` exists, but it is not Context Pack |
| Tests / Gates | exists | npm scripts already expose tests and gates |
| Harness | not yet | no stable harness policy / allowlist / write scope found |
| Task List | not yet | not landed as a first-class object |
| Context Pack | not yet | not landed as a first-class object |

---

## 5. Main Gap Analysis

### Gap 1: Pipeline v2 is too heavy

`pipeline-v2.js` handles:

```text
parse
routing
media
memory
classification
planning
gate
execution
reply
doc export
research clarify state
```

It is the real main path, but governance concerns are scattered inside one large orchestration function.

Recommendation: do not directly rewrite the whole pipeline. First introduce Task List / Context Pack / Gate / Trace object models around the existing path.

---

### Gap 2: Planner is not yet PM Agent

`request-planner.js` currently does:

```text
classifyOpenclawIntent
resolveOpenclawPolicies
planExecutionBroker
```

It is more of an execution planning facade than a full PM Agent.

Missing:

```text
- task decomposition
- multi-step plan
- Task List generation
- Context Pack selection
- Gate setup
- risk-aware execution strategy
```

Recommendation: do not turn `request-planner.js` into a giant brain directly. Add planner output structures and Task List schema first, then wire gradually.

---

### Gap 3: Task Context is not Context Pack

Current `task-context-builder.js` creates pipeline internal task context with chatId, messageId, task, classification, prompt, memory, etc.

That is useful for runtime, but it is not a governance Context Pack.

Context Pack should express:

```text
must_read
may_read
skip
constraints
expected_output
stop_conditions
```

Recommendation: add `workflow/schemas/context-pack.schema.json`, but do not replace existing task context directly.

---

### Gap 4: Run Trace exists but is not a complete audit ledger

`run-trace-recorder.js` already provides:

```text
createRunTrace
planAgents
recordAgentExecuted
recordSkippedAgent
recordHandoff
recordReviewer
setGateResult
```

Still missing:

```text
- where trace is persisted
- whether each task must have a trace
- how trace links to task_id
- how Gate failure writes to trace
- how users inspect a trace summary
```

Recommendation: first use `runs/YYYY-MM-DD/*.jsonl` or `workflow/runs/*.jsonl`. No database is needed at this stage.

---

### Gap 5: Harness is not yet a boundary object

The current docs position Harness correctly: Harness controls how execution happens; it does not decide what should be done.

But the repository does not yet show stable files such as:

```text
workflow/harness-policy.md
workflow/tool-allowlist.md
workflow/write-scope.md
```

Recommendation: add Harness only after Task List / Context Pack / Gate are stable.

---

## 6. Risk Areas

Do not start by heavily changing these areas:

| Area | Risk |
|---|---|
| `pipeline-v2.js` | main path is heavy; direct rewrite can break Feishu replies |
| `bridge-host.js` | WS connection, secrets, and systemd stability |
| `openclaw-gateway-adhoc.js` | affects OpenClaw Gateway calls |
| `workflow-execution-policy.js` | affects specialized / multi-agent decisions |
| `pipeline-gate-adapter.js` | fail-closed gate; errors can cause wrong fallback |
| `run-trace-recorder.js` | audit base; field changes need gate/test sync |
| `deploy/*.service` | production path and service behavior |

---

## 7. Recommended Minimum Next Cut

Do not start with Harness. Do not begin with a large `pipeline-v2.js` rewrite.

Recommended minimum cut:

```text
workflow/
  schemas/
    task-list.schema.json
    context-pack.schema.json
    run-trace.schema.json
  gates/
    intake-gate.md
    context-gate.md
    cleanup-gate.md
```

Then add:

```text
lib/openclaw-control-plane/task-list-planner.js
lib/openclaw-control-plane/context-pack-planner.js
```

But first create only schema and gate docs; do not wire runtime code yet.

---

## 8. Proposed Next Phase

Enter Phase 2: Governance Schema.

Suggested order:

1. Create `workflow/schemas/task-list.schema.json`.
2. Create `workflow/schemas/context-pack.schema.json`.
3. Create `workflow/schemas/run-trace.schema.json`.
4. Create `workflow/gates/intake-gate.md`.
5. Create `workflow/gates/context-gate.md`.
6. Create `workflow/gates/cleanup-gate.md`.
7. Then consider planner integration.

---

## 9. Current-State Verdict

Current system state:

```text
Feishu bridge main path exists
pipeline v2 exists
workflow classification exists
partial gates exist
runtime trace base exists
multi-agent governance docs exist
but Task List / Context Pack / Harness Boundary do not yet exist as first-class objects or a minimal runtime loop
```

Therefore, the next reform direction is not to rebuild everything. It is to add PM-Agent-grade governance objects around the existing pipeline and control plane.

---

## 10. Definition of Ready for Code Changes

Only start runtime code changes after these are true:

1. Task List schema exists.
2. Context Pack schema exists.
3. Run Trace schema is aligned with `run-trace-recorder.js`.
4. Intake / Context / Code / Cleanup gate rules are clear.
5. A minimum integration point is selected; do not rewrite the whole pipeline.
6. Rollback is defined: feature flag or fallback to old `taskContext` / old planner.
