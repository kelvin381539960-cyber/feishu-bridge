#!/usr/bin/env python3
"""
solution-gate.py — Solution workflow Gate

mode 仅允许 5 类：feasibility / roadmap / plan / release / growth。
taskSize 仅允许 4 档：S / M / L / XL。
L/XL 必须有 Reviewer 留痕。

只判断；不修复，不调用 LLM。

输入 JSON：
{
  "classification": { "taskType": "solution", ... },
  "mode": "feasibility|roadmap|plan|release|growth",
  "taskSize": "S|M|L|XL",
  "modelOutput": { ... } | "<text>",
  "runtimeRunTrace": { "reviewerRecords": [...], "handoffRecords": [...] }
}

输出 JSON：{ ok, workflow, mode, taskSize, errors, warnings, requiredFixes }
"""

from __future__ import annotations

import json
import re
import sys

ALLOWED_MODES = ("feasibility", "roadmap", "plan", "release", "growth")
ALLOWED_TASK_SIZES = ("S", "M", "L", "XL")

COMMON_REQUIRED_KEYWORDS = (
    ("conclusion", ("结论", "建议", "conclusion")),
    ("goal", ("目标", "为什么", "goal")),
    ("solution_design", ("方案设计", "设计", "solution_design", "方案结构")),
    ("execution_path", ("执行路径", "推进顺序", "execution_path", "步骤")),
    ("risk_response", ("风险", "应对", "risk", "约束", "依赖")),
    ("metrics_acceptance", ("指标", "验收", "metrics", "acceptance")),
    ("next_action", ("下一步", "next_action", "next step")),
)

MODE_REQUIRED = {
    "feasibility": (("recommendation", ("建议做", "暂不做", "有条件做", "recommendation")),
                    ("benefit", ("收益", "价值", "benefit")),
                    ("cost", ("成本", "投入", "cost")),
                    ("dependency", ("依赖", "前置", "dependency"))),
    "roadmap": (("phase", ("阶段", "phase")),
                ("timeline", ("时间", "timeline")),
                ("milestone", ("里程碑", "milestone")),
                ("priority", ("优先级", "priority")),
                ("deliverable", ("交付物", "deliverable"))),
    "plan": (("scope", ("范围", "scope")),
             ("steps", ("步骤", "steps")),
             ("decision_criteria", ("判断标准", "验收条件", "decision_criteria"))),
    "release": (("release_scope", ("发布范围", "release_scope")),
                ("release_cadence", ("灰度", "节奏", "release_cadence")),
                ("rollback", ("回滚", "rollback")),
                ("notice", ("通知", "notice"))),
    "growth": (("audience", ("人群", "audience")),
               ("channel", ("渠道", "channel")),
               ("conversion_path", ("转化", "conversion")),
               ("growth_action", ("增长动作", "运营动作", "growth_action")))
}


def fail(code: str, reason: str, **extra) -> dict:
    return {"ok": False, "code": code, "reason": reason, **extra}


def gate_result(passed: bool, mode: str, task_size: str, *, errors=None, warnings=None,
                required_fixes=None) -> dict:
    return {
        "ok": passed,
        "workflow": "solution",
        "mode": mode,
        "taskSize": task_size,
        "errors": errors or [],
        "warnings": warnings or [],
        "requiredFixes": required_fixes or [],
    }


def normalize_text(model_output) -> str:
    if isinstance(model_output, str):
        return model_output
    if isinstance(model_output, dict):
        try:
            return json.dumps(model_output, ensure_ascii=False)
        except (TypeError, ValueError):
            return ""
    return ""


def has_any(text: str, keywords) -> bool:
    return any(k in text for k in keywords)


def check_reviewer_records(trace: dict, task_size: str) -> list[str]:
    errs: list[str] = []
    if task_size not in ("L", "XL"):
        return errs
    records = trace.get("reviewerRecords") or [] if isinstance(trace, dict) else []
    if not isinstance(records, list) or not records:
        if task_size == "L":
            errs.append("SOLUTION_L_REVIEW_REQUIRED")
        else:
            errs.append("SOLUTION_XL_REVIEW_REQUIRED")
        return errs
    reviewers = []
    for r in records:
        if isinstance(r, dict) and r.get("reviewerAgent"):
            reviewers.append(r["reviewerAgent"])
    if task_size == "XL":
        has_exec = any("execution" in (rv or "").lower() for rv in reviewers)
        has_risk = any("risk" in (rv or "").lower() for rv in reviewers)
        if not (has_exec and has_risk):
            errs.append("SOLUTION_XL_REVIEW_REQUIRED")
    return errs


def run(payload: dict) -> dict:
    classification = payload.get("classification") or {}
    if classification.get("taskType") != "solution":
        return fail("SOLUTION_INVALID_TASK_TYPE", "solution-gate requires taskType=solution")
    mode = (payload.get("mode") or "").strip().lower()
    if mode not in ALLOWED_MODES:
        return fail(
            "SOLUTION_MODE_INVALID",
            f"mode must be one of {ALLOWED_MODES}, got: {mode}",
        )
    task_size = (payload.get("taskSize") or "").strip().upper()
    if task_size not in ALLOWED_TASK_SIZES:
        return fail(
            "SOLUTION_TASK_SIZE_INVALID",
            f"taskSize must be one of {ALLOWED_TASK_SIZES}, got: {task_size}",
        )

    text = normalize_text(payload.get("modelOutput"))
    if not text.strip():
        return fail("SOLUTION_EMPTY_OUTPUT", "modelOutput is empty")

    errors: list[str] = []
    warnings: list[str] = []

    missing_common: list[str] = []
    for label, kws in COMMON_REQUIRED_KEYWORDS:
        if not has_any(text, kws):
            missing_common.append(label)
    if "conclusion" in missing_common:
        errors.append("SOLUTION_CONTEXT_MISSING")
    if any(m in missing_common for m in ("goal", "solution_design", "execution_path")):
        errors.append("SOLUTION_DESIGN_MISSING")
    if "risk_response" in missing_common:
        errors.append("SOLUTION_RISK_MISSING")
    if "metrics_acceptance" in missing_common:
        errors.append("SOLUTION_ACCEPTANCE_MISSING")

    mode_missing: list[str] = []
    for label, kws in MODE_REQUIRED.get(mode, ()):
        if not has_any(text, kws):
            mode_missing.append(label)
    if mode_missing:
        errors.append({
            "feasibility": "SOLUTION_FEASIBILITY_FAILED",
            "roadmap": "SOLUTION_ROADMAP_FAILED",
            "plan": "SOLUTION_PLAN_FAILED",
            "release": "SOLUTION_RELEASE_FAILED",
            "growth": "SOLUTION_GROWTH_FAILED",
        }[mode])

    if re.search(r"```|代码|\bcode\b", text, re.IGNORECASE) and re.search(
        r"def\s+\w|\bfunction\b|require\(", text
    ):
        warnings.append("SOLUTION_SCOPE_VIOLATION")

    runtime_trace = payload.get("runtimeRunTrace") or {}
    review_errs = check_reviewer_records(runtime_trace, task_size)
    errors.extend(review_errs)

    if review_errs:
        errors.append("SOLUTION_REVIEW_FAILED_FINAL_BLOCKED")

    return gate_result(
        not errors,
        mode,
        task_size,
        errors=errors,
        warnings=warnings,
        required_fixes=[
            *(f"missing_common:{m}" for m in missing_common),
            *(f"missing_mode:{m}" for m in mode_missing),
            *(e for e in errors),
        ],
    )


def main() -> int:
    raw = sys.stdin.read()
    try:
        payload = json.loads(raw) if raw.strip() else {}
    except json.JSONDecodeError as e:
        result = fail("SOLUTION_INVALID_PAYLOAD", f"invalid input json: {e}")
    else:
        result = run(payload)
    sys.stdout.write(json.dumps(result, ensure_ascii=False))
    sys.stdout.write("\n")
    return 0 if result.get("ok") else 1


if __name__ == "__main__":
    sys.exit(main())
