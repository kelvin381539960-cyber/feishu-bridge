# North Star: Agent Governance OS

> This document defines the north-star direction before further runtime changes. It should be read before adding hard gates, Context Pack enforcement, Harness policy, durable execution, or learning-to-policy feedback.

---

## 1. Positioning

We should not try to become another general-purpose agent framework.

Public frameworks already have mature strengths:

| Public System | Public Strength | Reference |
|---|---|---|
| LangGraph | Persistence, checkpointing, human-in-the-loop, time travel, fault-tolerant execution | https://docs.langchain.com/oss/python/langgraph/persistence |
| OpenAI Agents SDK | Built-in tracing, spans for LLM calls, tool calls, handoffs, and guardrails; input/output/tool guardrails | https://openai.github.io/openai-agents-js/guides/tracing/ ; https://openai.github.io/openai-agents-js/guides/guardrails/ |
| Temporal / Pydantic AI | Durable execution, workflow/activity split, failure recovery, long-running workflows | https://ai.pydantic.dev/temporal/ ; https://pydantic.dev/docs/ai/integrations/durable_execution/overview/ |
| CrewAI | Productized agents, crews, flows, memory, knowledge, guardrails, observability, human-in-the-loop triggers | https://docs.crewai.com/en |

The target is narrower and more defensible:

```text
Agent Governance OS for product-management and engineering-collaboration workflows.
```

Primary environment:

```text
Feishu / Cursor / OpenClaw / Codex-style code agents / product-document workflows
```

The system should be best at:

```text
task governance
context control
forecast-before-execution
human-owned risk control
execution traceability
learning-to-policy feedback
```

---

## 2. What “First” Means

“First” does not mean beating Temporal at durable execution or beating OpenAI Agents SDK at general-purpose agent SDK design.

It means becoming the strongest system in this vertical category:

```text
AI work governance for product managers, engineering leads, and AI-assisted delivery teams.
```

The system should be able to answer:

1. What is the user asking for?
2. What tasks are needed?
3. What future risks are predicted before execution?
4. What context is allowed for each task?
5. Which tools and files may be touched?
6. What actually happened?
7. Why did the system continue, pause, warn, or block?
8. What should be learned for future runs?
9. Which policy version approved the behavior?
10. Can a human audit and override it?

---

## 3. Design Principle

Do not let the model own execution authority.

Correct split:

```text
LLM proposes.
System decides.
Human owns policy.
Runtime records facts.
```

Wrong split:

```text
LLM forecasts risk.
LLM decides whether to execute.
LLM changes policy automatically.
```

The north-star system must separate:

| Layer | Owner | Responsibility |
|---|---|---|
| Forecast | LLM-assisted | Predict outcomes, failure modes, and rollback options |
| Gate Decision | Deterministic policy + human policy | Decide warning / pause / block |
| Execution | Harness / runtime | Run allowed tools under scope |
| Trace | Runtime | Record facts, files, tools, outputs, errors |
| Learning | Aggregator + human review | Recommend policy improvements |
| Policy Evolution | Human-approved versioning | Change future behavior deliberately |

---

## 4. North-Star Architecture

```text
User Request
  -> Intent / Attention Router
  -> PM Agent / Planner
  -> Forecast Layer
  -> Task Graph
  -> Context Pack Builder
  -> Policy Gate
  -> Execution Harness
  -> Executor Agent / Tool
  -> Runtime Trace
  -> Output Gate
  -> Learning Memory
  -> Human Review
  -> Policy Evolution
```

### Layer Responsibilities

| Layer | Responsibility | Must Not Do |
|---|---|---|
| Intent Router | Classify request and route workflow | Decide final execution authority |
| PM Agent / Planner | Decompose goal into task graph | Execute tools directly |
| Forecast Layer | Predict outcomes, risks, dependencies, rollback | Become a hard authority by itself |
| Task Graph | Track tasks, dependencies, status, owners | Do reasoning |
| Context Pack Builder | Create task-specific working memory | Allow full-repo context by default |
| Policy Gate | Apply deterministic warning / pause / block rules | Rely only on model confidence |
| Execution Harness | Enforce command/file/tool boundaries | Decide product priority |
| Executor Agent | Do the assigned work | Expand scope silently |
| Runtime Trace | Record what happened | Rewrite history |
| Output Gate | Check final artifact quality and safety | Generate the artifact itself |
| Learning Memory | Store patterns and recommendations | Auto-change policy |
| Human Review | Approve policy changes and high-risk execution | Be bypassed for critical operations |
| Policy Evolution | Version governance behavior | Mutate silently |

---

## 5. Differentiation Against Public Frameworks

### We should not compete on their strongest layers

| Area | Better Public Baseline | Our Strategy |
|---|---|---|
| Durable execution engine | Temporal / Pydantic AI | Integrate or adapt later, do not rebuild first |
| Graph checkpointing | LangGraph | Borrow concept; use when graph execution matures |
| General tracing SDK | OpenAI Agents SDK | Keep compatible concepts; focus on governance semantics |
| Multi-agent productization | CrewAI | Avoid generic multi-agent platform competition |

### We should compete on governance semantics

Our differentiators should be:

1. Forecast-before-execution as a first-class object.
2. Context Pack as enforced working memory, not loose retrieval.
3. Gate as staged policy: observe -> warn -> limited hard gate -> full policy.
4. Trace linked to task graph, forecast, gate, context, and learning.
5. Learning-to-policy feedback with human approval.
6. Product/engineering workflow orientation, not generic chat-agent orchestration.
7. Feishu/Cursor/OpenClaw/Codex operating context.

---

## 6. Scoring Model

Use this scorecard to judge whether the system is improving.

| Dimension | Weight | v0.1 Current | North-Star Target |
|---|---:|---:|---:|
| Task decomposition and planning | 10 | 6 | 9 |
| Forecast quality | 10 | 5 | 9 |
| Context control | 15 | 2 | 10 |
| Execution safety | 15 | 4 | 10 |
| Traceability | 10 | 6 | 9 |
| Durable execution / recovery | 10 | 1 | 8 |
| Human-in-the-loop governance | 10 | 3 | 9 |
| Learning-to-policy feedback | 10 | 3 | 9 |
| Benchmark and evaluation | 10 | 1 | 9 |
| Total | 100 | 31 raw / about 80 practical design score | 91+ |

The practical design score is higher than the raw implementation score because the architecture direction is coherent. The implementation score remains low until Context Pack enforcement, durable execution, and benchmark data exist.

---

## 7. Maturity Stages

### v0.1 — Observation Layer

Current target state:

```text
Forecast metadata
Learning record
Trace carries forecast and learning signals
No runtime blocking
No automatic policy mutation
```

Purpose:

```text
Collect signal without changing execution behavior.
```

Exit criteria:

1. Forecast is generated for relevant workflows.
2. Learning records are captured.
3. No user-visible execution is blocked by forecast.
4. We can inspect whether predictions were useful.

---

### v0.2 — Context Pack Governance

Add:

```text
Context Pack Builder
must_read / may_read / skip
context expansion request
context pollution logging
```

Purpose:

```text
Reduce context pollution before introducing hard safety gates.
```

Exit criteria:

1. Each complex task has a Context Pack.
2. Executor receives only approved context.
3. Additional context requires explicit expansion request.
4. Trace records context used and context requested.

---

### v0.3 — Soft Gate

Add:

```text
warning-only gates
risk dashboard
false-positive / false-negative review
```

Purpose:

```text
Measure whether gates are useful before they can block.
```

Exit criteria:

1. Warnings are recorded.
2. Humans can review whether warnings were correct.
3. Gate accuracy can be estimated.
4. No normal execution is blocked.

---

### v0.4 — Limited Hard Gate

Only hard-block these categories:

```text
file deletion
credential / token / env changes
deployment / systemd changes
large cross-directory writes
high-risk runtime policy changes
```

Purpose:

```text
Block only objectively dangerous actions.
```

Exit criteria:

1. Hard gate applies only to explicit high-risk categories.
2. User confirmation path exists.
3. Override is traceable.
4. Gate decisions are deterministic policy decisions, not direct LLM decisions.

---

### v0.5 — Durable Runtime Adapter

Add one of:

```text
local jsonl checkpoint
LangGraph persistence adapter
Temporal / Pydantic AI durable adapter
```

Purpose:

```text
Support pause, resume, retry, and recovery.
```

Exit criteria:

1. Task graph can resume after interruption.
2. Human approval can pause and resume execution.
3. Long-running workflows are not lost on process restart.
4. Replay / recovery semantics are documented.

---

### v0.6 — Learning Review Loop

Add:

```text
learning record aggregator
failure-pattern clustering
policy recommendation report
human approval for policy changes
policy version changelog
```

Purpose:

```text
Turn logs into reviewed policy evolution.
```

Exit criteria:

1. Repeated failure patterns are summarized.
2. Policy recommendations are generated.
3. Policy changes require human approval.
4. Policy version changes are traceable.

---

### v1.0 — Agent Governance OS

Full target:

```text
PM Agent
Forecast Layer
Task Graph
Context Pack Enforcement
Policy Gate
Execution Harness
Runtime Trace
Learning Memory
Human Review
Policy Evolution
Benchmark Suite
```

v1.0 means the system is no longer just an AI assistant wrapper. It is an audited execution-governance layer for AI work.

---

## 8. Benchmark Plan

Without benchmark, “first” is only opinion.

Create a benchmark suite with tasks across:

| Task Type | Examples |
|---|---|
| PRD | generate / update PRD from mixed context |
| Research | source-backed competitor or product research |
| Solution | architecture and workflow design |
| Code | safe small code change with tests |
| Cleanup | classify and delete generated artifacts only |
| Ops | deployment-related task requiring caution |
| Governance | modify task/gate/policy safely |

### Metrics

| Metric | Meaning |
|---|---|
| task completion rate | Whether the task was completed acceptably |
| context pollution rate | Whether irrelevant/old/generated files affected output |
| forecast usefulness | Whether failure modes and risk forecast were useful |
| warning precision | Whether soft gate warnings were correct |
| false block rate | Whether hard gate blocked valid work |
| unsafe pass rate | Whether dangerous work passed incorrectly |
| trace completeness | Whether files/tools/decisions are reconstructable |
| recovery success rate | Whether interrupted runs can resume |
| human intervention quality | Whether human approvals are targeted and useful |
| policy improvement yield | Whether learning records produce useful policy changes |

### Baselines

Compare against:

```text
Plain LLM / Cursor direct execution
LangGraph baseline
OpenAI Agents SDK baseline
CrewAI baseline
Our Agent Governance OS
```

The goal is not to beat every baseline on every metric. The goal is to beat them on governance-specific metrics.

---

## 9. What We Should Not Do

Do not:

1. Build a generic agent framework first.
2. Add hard gates before warning accuracy is measured.
3. Let LLM output directly decide execution authority.
4. Let learning records mutate policy automatically.
5. Enforce Context Pack only on paper.
6. Rebuild Temporal or LangGraph from scratch.
7. Add multi-agent complexity before single-agent governance is stable.
8. Treat documentation as implementation.

---

## 10. Immediate Next Decisions

Before more code changes, decide:

1. What is the first benchmark set?
2. What is the Context Pack enforcement design?
3. What fields must be persisted for trace and learning?
4. Which high-risk categories qualify for future hard gate?
5. Which durable runtime path should be used first: local jsonl, LangGraph, or Temporal/Pydantic AI?

Recommended order:

```text
1. freeze v0.1 as observation-only
2. design benchmark tasks
3. design Context Pack enforcement
4. design trace/learning persistence
5. only then add limited hard gates
```

---

## 11. Final North-Star Statement

The north-star product is:

```text
An Agent Governance OS that makes AI work forecasted, scoped, observable, recoverable, and improvable under human-owned policy.
```

The point is not to make agents more autonomous first.

The point is to make AI execution safe enough, visible enough, and governable enough that autonomy can be increased deliberately.
