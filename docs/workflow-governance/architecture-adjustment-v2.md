# Workflow Governance Architecture Adjustment v2

> This document adjusts the workflow-governance plan by making the Forecast Layer explicit. It is the current recommended entrypoint for understanding the revised architecture.

---

## 1. Why v2 Exists

The previous plan already had these core components:

```text
PM Agent
Task List
Context Pack
Executor
Gate
Trace
Harness
Result Policy
```

That structure is directionally correct, but it treated future prediction as an implicit behavior inside PM Agent, Task List, Gate, and Roadmap.

The v2 adjustment makes prediction explicit:

```text
Plan
  -> Forecast
  -> Risk
  -> Gate
  -> Execute
```

This better matches how a stable executive-control system should work: it should not only decide what to do now, but also simulate what may happen next.

---

## 2. Revised Core Architecture

The recommended architecture is now:

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
  -> Reply / Commit / Document / Next Task
```

### Component Meaning

| Component | Role |
|---|---|
| Intent / Attention Router | Determines which workflow path the request belongs to. |
| PM Agent / Planner | Converts the user request into structured goals and tasks. |
| Forecast Layer | Simulates outcomes, failure modes, dependencies, and next steps before execution. |
| Task List | Stores task state, ownership, dependency, and execution plan. |
| Context Pack | Limits each execution unit to relevant context. |
| Executor Agent | Performs the assigned task. |
| Gate | Checks whether the output is safe, complete, and acceptable. |
| Harness / Runtime Boundary | Controls allowed tools, commands, directories, and write scope. |
| Run Trace | Records what happened. |
| Result Policy | Decides whether to reply, continue, write docs, commit, or stop. |

---

## 3. Brain-Inspired Mapping

The plan should reference brain structure only as an engineering analogy, not as literal organ-to-agent mapping.

| Brain-Inspired Function | Engineering Equivalent | Usefulness |
|---|---|---|
| Attention selection | Intent Router / Task Classifier | High |
| Executive control | PM Agent / Planner | High |
| Future simulation | Forecast Layer | High |
| Working memory | Context Pack | High |
| Inhibition / action gating | Gate / Policy | High |
| Motor correction / feedback | Harness / Tests / Runtime feedback | Medium-High |
| Long-term memory | Docs / Trace / Decision logs | High |

Do not create agents named after brain regions. Use engineering terms.

---

## 4. Forecast Layer

Forecast Layer is the key adjustment.

It answers these questions before execution:

```text
1. If this task succeeds, what becomes true?
2. If this task fails, what may break?
3. What dependencies must be completed first?
4. What future step will this unlock?
5. What is the rollback path?
6. Should this task execute now, wait, or request confirmation?
```

Forecast is not a separate executor. It is a planning function that sits between PM Agent and Task List / Gate.

---

## 5. Revised PM Agent Flow

The PM Agent should follow this flow for complex tasks:

```text
1. classify intent
2. understand goal
3. decompose tasks
4. forecast outcomes
5. identify failure modes
6. assign risk forecast
7. choose gates
8. create Context Pack requirements
9. create or update Task List
10. decide execute / pause / ask / stop
```

This prevents the system from jumping directly from plan to execution.

---

## 6. Task List Schema Changes

Task List should include forecast fields.

Recommended additional fields:

```json
{
  "expected_outcome": "What should be true after this task succeeds.",
  "next_step_prediction": "What this task unlocks next.",
  "failure_modes": [
    "Possible failure or bad consequence."
  ],
  "risk_forecast": "low | medium | high",
  "rollback_plan": "How to reverse or contain the change.",
  "execute_decision": "execute | pause | needs_user_confirmation | blocked"
}
```

These fields should be added to `workflow/schemas/task-list.schema.json` in Phase 2.

---

## 7. Context Pack Schema Changes

Context Pack should include forecast-related boundaries.

Recommended additional fields:

```json
{
  "forecast_assumptions": [
    "Assumption the executor must preserve or verify."
  ],
  "known_risks": [
    "Risk that should be watched during execution."
  ],
  "stop_conditions": [
    "Condition that requires stopping instead of continuing."
  ],
  "allowed_scope": [
    "Files or areas allowed for this task."
  ],
  "disallowed_scope": [
    "Files or areas that should not be touched."
  ]
}
```

These fields make Context Pack act more like working memory with boundaries.

---

## 8. Gate Changes

Gate should check forecast quality, not only output quality.

Add or extend these gates:

```text
Intake Gate
  - Is the goal clear?
  - Is the forecast sufficient for the task risk?

Forecast Gate
  - Are expected outcome, failure modes, risk forecast, and rollback plan present?
  - Does the forecast justify execution?

Context Gate
  - Does the Context Pack match the forecasted risk and scope?

Code Gate
  - Did the actual diff stay within forecasted scope?

Cleanup Gate
  - Was deletion risk forecasted and approved?
```

Recommended new file in Phase 2:

```text
workflow/gates/forecast-gate.md
```

---

## 9. Revised Phase Plan

### Phase 0 — Context and Governance Baseline

Already mostly complete:

```text
docs/ai-context/
docs/workflow-governance/
```

### Phase 1 — Current-State Audit

Already started with:

```text
docs/workflow-governance/workflow-current-state.md
```

### Phase 2 — Governance Schema v2

Create:

```text
workflow/schemas/task-list.schema.json
workflow/schemas/context-pack.schema.json
workflow/schemas/run-trace.schema.json
workflow/gates/intake-gate.md
workflow/gates/forecast-gate.md
workflow/gates/context-gate.md
workflow/gates/cleanup-gate.md
```

### Phase 3 — PM Planning + Forecast Loop

Add planner output that includes:

```text
tasks
forecast
risk_forecast
gate_plan
context_pack_plan
execute_decision
```

Candidate files:

```text
lib/openclaw-control-plane/request-planner.js
lib/openclaw-control-plane/task-list-planner.js
lib/openclaw-control-plane/context-pack-planner.js
```

### Phase 4 — Context Pack Execution

Add a runtime Context Pack object without replacing the existing task context immediately.

### Phase 5 — Gate and Trace Integration

Link:

```text
Task List
Forecast
Gate Result
Run Trace
```

### Phase 6 — Harness Boundary

Only after the planning, forecast, context, and gate loop are stable.

### Phase 7 — Multi-Agent Expansion

Only after the single-agent planned execution path is stable.

---

## 10. What Changes from v1

| Area | v1 | v2 |
|---|---|---|
| PM Agent | plans tasks | plans tasks and forecasts consequences |
| Task List | tracks status | tracks status plus expected outcome, failure modes, rollback |
| Context Pack | limits context | limits context and encodes risk assumptions |
| Gate | checks result | checks forecast, context, result, and risk |
| Harness | execution boundary | still execution boundary; not moved earlier |
| Roadmap | schema before code | same, but schema now includes forecast fields |

---

## 11. Recommended Next Action

Next implementation step:

```text
Create Phase 2 schema and gate files with Forecast Layer included.
```

Recommended files:

```text
workflow/schemas/task-list.schema.json
workflow/schemas/context-pack.schema.json
workflow/schemas/run-trace.schema.json
workflow/gates/intake-gate.md
workflow/gates/forecast-gate.md
workflow/gates/context-gate.md
workflow/gates/cleanup-gate.md
```

Do not modify `pipeline-v2.js` yet.

---

## 12. Final Position

The most reasonable architecture is not only:

```text
PM Agent -> Task List -> Context Pack -> Executor -> Gate
```

It should be:

```text
PM Agent -> Forecast Layer -> Task List -> Context Pack -> Executor -> Gate -> Trace
```

The Forecast Layer is what gives the system forward-looking control instead of simple task execution.
