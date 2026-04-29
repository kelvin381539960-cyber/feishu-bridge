#!/usr/bin/env python3
"""
verify-workflow-gates.py — 统一 Gate 分发入口

只支持 5 类 workflow：prd / research / code / solution / general。
本入口只做：
  - 校验 classification schema（taskType / workflow / role / confidence / fallbackReason）
  - 校验 specialized 必含 runtimeRunTrace + decisionReason；multiAgent / solo 分支结构
  - 把 payload 分发给具体 Gate 脚本

Gate 失败时：返回 ok=false，非零退出码；上层 pipeline 据此阻断 finalOutput。

用法：
  echo '<json>' | python3 scripts/verify-workflow-gates.py
  python3 scripts/verify-workflow-gates.py --input payload.json [--pretty]
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent

FINAL_WORKFLOWS = ("prd", "research", "code", "solution", "general")
SPECIALIZED_WORKFLOWS = ("prd", "research", "code", "solution")

GATE_DISPATCH = {
    "prd": ROOT / "verify-prd-gates.py",
    "research": ROOT / "research-gate.py",
    "code": ROOT / "code-gate.py",
    "solution": ROOT / "solution-gate.py",
}


def fail(code: str, reason: str, **extra) -> dict:
    return {"ok": False, "code": code, "reason": reason, **extra}


def ok(**extra) -> dict:
    return {"ok": True, **extra}


def normalize_classification(classification: dict) -> dict:
    c = dict(classification) if isinstance(classification, dict) else {}
    if not c.get("workflow"):
        c["workflow"] = c.get("workflowKey") or c.get("taskType") or ""
    return c


def validate_classification(classification: dict) -> dict | None:
    if not isinstance(classification, dict):
        return fail("CLASSIFICATION_SCHEMA_INVALID", "classification must be object")
    required = ("taskType", "workflow", "role")
    for k in required:
        if not classification.get(k):
            return fail(
                "CLASSIFICATION_SCHEMA_INVALID", f"classification.{k} required"
            )
    if classification["taskType"] not in FINAL_WORKFLOWS:
        return fail(
            "GATE_SUPPORTED_TASK_TYPES_ONLY",
            f"unsupported workflow taskType: {classification['taskType']}",
            allowed=list(FINAL_WORKFLOWS),
        )
    if classification.get("role") == "fallback" and not classification.get("fallbackReason"):
        return fail(
            "CLASSIFICATION_SCHEMA_INVALID",
            "fallback classification requires fallbackReason",
        )
    return None


def _validate_multi_agent_trace_shape(trace: dict) -> dict | None:
    if trace.get("source") != "runtime":
        return fail("RUNTIME_TRACE_INVALID", "runtimeRunTrace.source must be 'runtime'")
    planned = trace.get("agentsPlanned") or []
    if not (isinstance(planned, list) and len(planned) > 0):
        return fail("RUNTIME_TRACE_INVALID", "runtimeRunTrace.agentsPlanned required")
    skips = trace.get("skippedAgents") or []
    planned_list = list(planned)
    all_planned_skipped = planned_list and all(
        any(isinstance(s, dict) and s.get("agentRole") == p for s in skips)
        for p in planned_list
    )
    executed = trace.get("agentsExecuted") or []
    if not all_planned_skipped and not (isinstance(executed, list) and len(executed) > 0):
        return fail("RUNTIME_TRACE_INVALID", "runtimeRunTrace.agentsExecuted required")
    hrs = trace.get("handoffRecords") or []
    if not (isinstance(hrs, list) and len(hrs) > 0):
        return fail("RUNTIME_TRACE_INVALID", "runtimeRunTrace.handoffRecords required")
    return None


def _validate_plan_fulfillment(trace: dict) -> dict | None:
    planned = set(trace.get("agentsPlanned") or [])
    executed_ok = {
        x.get("agentRole")
        for x in (trace.get("agentsExecuted") or [])
        if isinstance(x, dict) and x.get("status") == "completed"
    }
    skipped_roles = {
        x.get("agentRole")
        for x in (trace.get("skippedAgents") or [])
        if isinstance(x, dict) and x.get("agentRole")
    }
    for p in planned:
        if p not in executed_ok and p not in skipped_roles:
            return fail(
                "AGENTS_PLAN_NOT_FULFILLED",
                f"planned agent not executed or skipped: {p}",
            )
    return None


def validate_runtime_trace(payload: dict, classification: dict) -> dict | None:
    wf = classification.get("taskType")
    role = classification.get("role")
    trace = payload.get("runtimeRunTrace")
    specialized = wf in SPECIALIZED_WORKFLOWS and role == "specialized"

    if specialized:
        if not isinstance(trace, dict):
            return fail(
                "SPECIALIZED_TRACE_REQUIRED",
                "specialized workflow requires runtimeRunTrace object",
            )
        if trace.get("source") != "runtime":
            return fail(
                "SPECIALIZED_TRACE_REQUIRED",
                "runtimeRunTrace.source must be 'runtime'",
            )
        if not str(trace.get("decisionReason") or "").strip():
            return fail(
                "SPECIALIZED_DECISION_REASON_REQUIRED",
                "runtimeRunTrace.decisionReason required",
            )
        multi = bool(payload.get("multiAgentRequired"))
        if multi:
            err = _validate_multi_agent_trace_shape(trace)
            if err:
                return err
            for r in trace.get("handoffRecords") or []:
                if not isinstance(r, dict):
                    return fail("RUNTIME_TRACE_INVALID", "handoff record must be object")
            err2 = _validate_plan_fulfillment(trace)
            if err2:
                return err2
            return None
        ag = trace.get("agentsExecuted") or []
        if not isinstance(ag, list) or len(ag) < 1:
            return fail(
                "SOLO_TRACE_INCOMPLETE",
                "specialized solo requires agentsExecuted (>=1)",
            )
        for s in trace.get("skippedAgents") or []:
            if not isinstance(s, dict) or not str(s.get("skipReason") or "").strip():
                return fail(
                    "SOLO_TRACE_INCOMPLETE",
                    "skippedAgents.*.skipReason required for specialized solo",
                )
        return None

    if payload.get("multiAgentRequired"):
        if not isinstance(trace, dict):
            return fail(
                "RUNTIME_TRACE_REQUIRED",
                "multiAgentRequired requires runtimeRunTrace",
            )
        return _validate_multi_agent_trace_shape(trace)
    return None


def general_fallback_check(payload: dict, classification: dict) -> dict:
    """General Gate 只做 fallback 边界校验：确认未误抢 specialized。"""
    if classification.get("role") != "fallback":
        return fail(
            "GENERAL_SPECIALIZED_MISROUTE",
            "general workflow must use role=fallback",
        )
    if not classification.get("fallbackReason"):
        return fail(
            "CLASSIFICATION_SCHEMA_INVALID",
            "general workflow requires fallbackReason",
        )
    return ok(workflow="general", mode="fallback", gate="general")


def dispatch_subgate(workflow: str, payload: dict) -> dict:
    script = GATE_DISPATCH.get(workflow)
    if script is None or not script.exists():
        return fail(
            "GATE_SCRIPT_MISSING",
            f"gate script for workflow={workflow} not found",
            script=str(script) if script else "",
        )
    try:
        proc = subprocess.run(
            [sys.executable, str(script)],
            input=json.dumps(payload),
            capture_output=True,
            text=True,
            timeout=30,
        )
    except subprocess.TimeoutExpired:
        return fail(
            "GATE_EXECUTION_FAILED",
            f"gate script timeout: {workflow}",
        )
    except Exception as e:  # noqa: BLE001
        return fail("GATE_EXECUTION_FAILED", f"gate script error: {e}")
    stdout = (proc.stdout or "").strip()
    if not stdout:
        return fail(
            "GATE_EXECUTION_FAILED",
            f"gate script empty output (rc={proc.returncode}): {workflow}",
            stderr=proc.stderr,
        )
    try:
        data = json.loads(stdout)
    except json.JSONDecodeError as e:
        return fail(
            "GATE_EXECUTION_FAILED",
            f"gate script invalid json: {e}",
            raw=stdout[:512],
        )
    if not isinstance(data, dict):
        return fail("GATE_EXECUTION_FAILED", "gate script output not object")
    if "workflow" not in data:
        data["workflow"] = workflow
    return data


def run(payload: dict) -> dict:
    classification = normalize_classification(payload.get("classification") or {})
    payload["classification"] = classification
    schema_err = validate_classification(classification)
    if schema_err:
        return schema_err

    workflow = classification["taskType"]

    trace_err = validate_runtime_trace(payload, classification)
    if trace_err:
        return trace_err

    if workflow == "general":
        return general_fallback_check(payload, classification)

    return dispatch_subgate(workflow, payload)


def parse_args():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--input", help="JSON payload file (default: stdin)")
    p.add_argument("--pretty", action="store_true", help="pretty-print json output")
    return p.parse_args()


def main() -> int:
    args = parse_args()
    if args.input:
        raw = Path(args.input).read_text(encoding="utf-8")
    else:
        raw = sys.stdin.read()
    try:
        payload = json.loads(raw) if raw.strip() else {}
    except json.JSONDecodeError as e:
        result = fail("GATE_EXECUTION_FAILED", f"invalid input json: {e}")
    else:
        result = run(payload)
    indent = 2 if args.pretty else None
    sys.stdout.write(json.dumps(result, ensure_ascii=False, indent=indent))
    sys.stdout.write("\n")
    return 0 if result.get("ok") else 1


if __name__ == "__main__":
    sys.exit(main())
