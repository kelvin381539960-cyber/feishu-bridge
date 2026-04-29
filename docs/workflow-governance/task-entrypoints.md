# Task Entrypoints

> This document defines how different task types should enter the workflow-governance system. It belongs under `docs/workflow-governance/` because it is part of the reform plan, not only an AI reading entrypoint.

---

## 1. General Rule

All tasks should start from:

```text
AGENTS.md
docs/ai-context/README.md
docs/ai-context/00-migration-note.md
```

If the task involves workflow governance, Harness, Agent execution, Task List, Context Pack, Gate, or Trace, continue with:

```text
docs/workflow-governance/README.md
docs/workflow-governance/workflow-governance-map.md
docs/workflow-governance/implementation-roadmap.md
docs/workflow-governance/task-entrypoints.md
```

Default skip list:

```text
*.png
*.jpg
*.jpeg
*.docx
backup / historical / ARCHIVED
crawl_output/
docs/aix-phase2/solution-design/docx-mermaid-assets/
docs/aix-phase2/solution-design/exports-for-word/
```

---

## 2. Entrypoint Matrix

| Task Type | Task List | Context Pack | Gate | First Read |
|---|---:|---:|---:|---|
| Simple Answer | no | no | no | `AGENTS.md`, `docs/ai-context/README.md` |
| Bug Fix | maybe | yes | yes | entry docs + related source + tests |
| Feature Change | yes | yes | yes | entry docs + related modules + policy |
| Workflow / Governance | yes | yes | yes | `docs/workflow-governance/*` + `docs/cursor-architecture/*` |
| Harness / Execution Boundary | yes | yes | yes | governance docs + deploy/scripts |
| PRD Generation | yes | yes | output gate | PRD workflow + docs/prd |
| Research | yes | yes | research gate | research workflow + docs/research |
| Solution Design | yes | yes | solution gate | solution workflow + architecture docs |
| Code Review | maybe | yes | review gate | changed files + tests + policy |
| Cleanup / Delete | yes | yes | cleanup gate | file list + AI skip rules |
| Deployment / Ops | yes | yes | security gate | AGENTS + deploy + selfcheck scripts |

---

## 3. Simple Answer

### Criteria

- User asks for explanation, comparison, advice, or a short text.
- No large file reading is needed.
- No repository write is needed.

### Flow

```text
User Request
  -> Answer
```

### Forbidden Actions

- Do not create files.
- Do not commit.
- Do not start the heavy workflow.

---

## 4. Bug Fix

### Criteria

Examples:

- Feishu does not reply.
- OpenClaw call fails.
- Cursor task execution fails.
- WebSocket connection issue.
- Script error.

### Must Read

```text
AGENTS.md
docs/ai-context/README.md
package.json
feishu-ws-cursor.js
lib/feishu-channel/bridge-host.js
lib/feishu-cursor/pipeline-v2.js
lib/openclaw-gateway-adhoc.js
scripts/feishu-bridge-selfcheck.js
scripts/runtime-smoke-tests.js
```

Optional:

```text
lib/feishu-cursor/policies/*
lib/openclaw-control-plane/*
test/
deploy/*.service
```

### Flow

```text
classify bug
  -> identify failing path
  -> read minimal files
  -> propose cause
  -> patch minimal file
  -> run / suggest test
  -> summarize diff and rollback
```

### Gates

- Code Gate
- Security Gate if deployment or credentials are involved
- Review Gate before delivery

---

## 5. Feature Change

### Criteria

The user requests a new capability, process change, output format change, or policy adjustment.

### Must Read

```text
AGENTS.md
docs/ai-context/README.md
package.json
lib/feishu-cursor/pipeline-v2.js
lib/feishu-cursor/policies/*
lib/feishu-cursor/task-builders/*
lib/openclaw-control-plane/*
test/
```

### Flow

```text
User Request
  -> PM creates small plan
  -> identify affected modules
  -> define Context Pack
  -> patch
  -> test / gate
  -> summarize
```

### Gates

- Intake Gate
- Context Gate
- Code Gate
- Review Gate

---

## 6. Workflow / Governance

### Criteria

The user mentions:

```text
Cursor workflow
governance
PM Agent
Task List
Context Pack
Gate
Run Trace
Harness
multi-agent
OpenClaw routing
```

### Must Read

```text
docs/ai-context/README.md
docs/ai-context/00-migration-note.md
docs/workflow-governance/README.md
docs/workflow-governance/workflow-governance-map.md
docs/workflow-governance/implementation-roadmap.md
docs/workflow-governance/task-entrypoints.md
docs/cursor-architecture/README.md
docs/cursor-architecture/generic-workflow.md
docs/cursor-architecture/workflow-evolution-policy.md
docs/cursor-architecture/workflow-governance-overview.md
docs/cursor-architecture/multi-agent/
```

Optional:

```text
lib/openclaw-control-plane/request-planner.js
lib/openclaw-control-plane/workflow-execution-policy.js
lib/feishu-cursor/task-builders/task-context-builder.js
lib/feishu-cursor/runtime/run-trace-recorder.js
lib/feishu-cursor/runtime/pipeline-gate-adapter.js
```

### Flow

```text
User Request
  -> Current-state check
  -> Governance plan
  -> Task List
  -> Context Pack
  -> document first
  -> code later
```

### Gates

- Intake Gate
- Context Gate
- Output Gate
- Review Gate

Default policy: write plan or docs before changing core pipeline code.

---

## 7. Harness / Execution Boundary

### Criteria

The user asks to limit agent behavior, control commands, control read/write directories, run automation, or define sandbox/allowlist/denylist.

### Must Read

```text
docs/workflow-governance/workflow-governance-map.md
docs/workflow-governance/implementation-roadmap.md
AGENTS.md
deploy/
scripts/*selfcheck*
scripts/runtime-smoke-tests.js
```

Optional:

```text
lib/openclaw-control-plane/*
lib/feishu-cursor/runtime/*
```

### Flow

```text
Define execution boundary
  -> command allowlist
  -> write scope
  -> timeout policy
  -> failure handling
  -> trace integration
```

### Gates

- Security Gate
- Code Gate
- Review Gate

Default policy: Harness controls how execution may happen; it does not decide what should be done.

---

## 8. PRD Generation / Update

### Must Read

```text
docs/ai-context/README.md
docs/cursor-architecture/prd-workflow.md
docs/cursor-architecture/multi-agent/prd.md
docs/prd/
```

Optional:

```text
docs/research/
docs/cursor-architecture/context/*
```

### Flow

```text
Intake
  -> clarify goal if needed
  -> gather existing artifacts
  -> create PRD brief
  -> draft PRD
  -> review gate
  -> write / return output
```

---

## 9. Research

### Must Read

```text
docs/ai-context/README.md
docs/cursor-architecture/multi-agent/research.md
docs/research/
```

Optional:

```text
docs/cursor-architecture/context/*
scripts/research-gate.py
```

### Flow

```text
Research goal
  -> source plan
  -> gather evidence
  -> synthesize
  -> research gate
  -> output report
```

---

## 10. Solution Design

### Must Read

```text
docs/ai-context/README.md
docs/cursor-architecture/multi-agent/solution.md
docs/cursor-architecture/generic-workflow.md
docs/cursor-architecture/workflow-governance-overview.md
lib/openclaw-control-plane/*
lib/feishu-cursor/*
```

Optional:

```text
docs/aix-phase2/solution-design/solution-design.md
```

### Flow

```text
Goal
  -> current-state analysis
  -> target architecture
  -> module boundaries
  -> phased implementation
  -> risk and rollback
```

---

## 11. Code Review

### Must Read

```text
Changed files
Related tests
AGENTS.md
docs/ai-context/README.md
Relevant policy files
```

### Flow

```text
Read changed files
  -> identify risk
  -> check tests
  -> summarize issues by severity
  -> suggest patch if needed
```

---

## 12. Cleanup / Delete

### Must Read

```text
docs/ai-context/README.md
docs/workflow-governance/task-entrypoints.md
full file list
```

### Preferred Delete Candidates

```text
crawl_output/
*.tmp
obvious test files
generated exports
backup / historical / ARCHIVED
unrelated demos
```

### Never Delete Directly

```text
AGENTS.md
docs/ai-context/*
docs/workflow-governance/*
package.json
feishu-ws-cursor.js
lib/**
deploy/**
scripts/*selfcheck*
current source documents
```

### Flow

```text
List candidates
  -> classify risk
  -> get user approval
  -> delete low-risk files
  -> summarize commits
```

---

## 13. Deployment / Ops

### Must Read

```text
AGENTS.md
deploy/
scripts/feishu-bridge-selfcheck.js
scripts/runtime-smoke-tests.js
package.json
```

Optional:

```text
lib/feishu-tenant.js
lib/openclaw-gateway-adhoc.js
```

### Flow

```text
Read ops docs
  -> identify environment
  -> suggest commands
  -> safety check
  -> rollback plan
```

---

## 14. Stop Conditions

Stop and return the reason instead of guessing when:

1. Key files cannot be read.
2. User goal conflicts with current governance rules.
3. A core source file would be deleted without explicit authorization.
4. Required production credentials are unavailable.
5. A Gate fails.
6. Task scope exceeds the current Context Pack.
7. Docs and code facts conflict and the authoritative source cannot be determined.

---

## 15. Commit Summary Requirement

Every repository write must return:

```text
- commit sha
- created / updated / deleted files
- why changed
- risk
- next step
```

---

## 16. Recommended Next Step

After this migration, continue with:

```text
Phase 1: Current-State Audit
```

The audit artifact should live at:

```text
docs/workflow-governance/workflow-current-state.md
```
