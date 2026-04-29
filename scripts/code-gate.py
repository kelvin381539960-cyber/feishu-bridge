#!/usr/bin/env python3
"""
code-gate.py — Code workflow Gate（inspect / execute 双模式）

只判断输出是否合格；不修复、不执行、不调用 LLM。

输入 JSON：
{
  "classification": { "taskType": "code", ... },
  "mode": "inspect" | "execute",
  "modelOutput": { ... } | "<text>",
  "metadata": {
    "userApprovalStatus": "approved" | "unknown" | "assumed" | "not_required",
    "hasExplicitExecuteApproval": bool,
    "riskLevel": "low" | "medium" | "high" | "critical",
    "dangerousOperation": bool,
    ...
  },
  "runtimeRunTrace": { ... }
}

输出 JSON：
{ ok, workflow, mode, errors, warnings, requiredFixes, riskLevel, canExecute, gateEvidence }
"""

from __future__ import annotations

import json
import re
import sys

ALLOWED_MODES = ("inspect", "execute")
ALLOWED_RISK_LEVELS = ("low", "medium", "high", "critical")

FAKE_EXECUTION_KEYWORDS = (
    "已修改",
    "已写入",
    "已删除",
    "已安装",
    "已重启",
    "已部署",
    "已创建",
    "已验证通过",
)

SECRET_RE = re.compile(
    r"(?:api[_-]?key|secret|token|password|private[_-]?key|sk-[A-Za-z0-9_-]{16,}|AKIA[0-9A-Z]{16})\s*[:=]\s*['\"]?[A-Za-z0-9_\-./+]{12,}",
    re.IGNORECASE,
)

HIGH_RISK_VERBS = (
    "rm -rf",
    "drop database",
    "drop table",
    "shutdown",
    "format",
    "kill -9",
    "systemctl restart",
    "systemctl stop",
    "delete from",
)


def fail(code: str, reason: str, **extra) -> dict:
    return {"ok": False, "code": code, "reason": reason, **extra}


def gate_result(passed: bool, mode: str, *, errors=None, warnings=None,
                required_fixes=None, risk_level="", can_execute=False,
                gate_evidence=None) -> dict:
    return {
        "ok": passed,
        "workflow": "code",
        "mode": mode,
        "errors": errors or [],
        "warnings": warnings or [],
        "requiredFixes": required_fixes or [],
        "riskLevel": risk_level,
        "canExecute": can_execute,
        "gateEvidence": gate_evidence or {},
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


def check_secrets(text: str) -> str | None:
    if SECRET_RE.search(text):
        return "CODE_SECRET_EXPOSURE_BLOCKED"
    return None


def has_section(text: str, *keywords: str) -> bool:
    return any(k in text for k in keywords)


def check_inspect(text: str, metadata: dict, errors: list[str]) -> None:
    if not has_section(text, "目标", "问题", "target"):
        errors.append("CODE_INSPECT_MISSING_TARGET")
    if not has_section(text, "判断", "依据", "原因", "judgement", "evidence"):
        errors.append("CODE_INSPECT_MISSING_JUDGEMENT")
    if not has_section(text, "下一步", "建议", "排查", "next_action", "next step"):
        errors.append("CODE_INSPECT_MISSING_NEXT_STEP")
    if not has_section(text, "授权", "确认", "permission", "approval"):
        errors.append("CODE_INSPECT_MISSING_PERMISSION_NOTE")
    if not has_section(text, "风险", "影响", "risk"):
        errors.append("CODE_INSPECT_MISSING_RISK_NOTICE")
    if not (
        has_section(text, "验证", "validation")
        and has_section(text, "回滚", "恢复", "rollback")
    ):
        errors.append("CODE_INSPECT_MISSING_VALIDATION_OR_ROLLBACK")
    for kw in FAKE_EXECUTION_KEYWORDS:
        if kw in text:
            errors.append("CODE_INSPECT_FAKE_EXECUTION")
            break


def check_execute(text: str, metadata: dict, runtime_trace: dict, errors: list[str]) -> None:
    approval = (metadata.get("userApprovalStatus") or "").strip().lower()
    explicit = bool(metadata.get("hasExplicitExecuteApproval"))
    if approval != "approved" or not explicit:
        errors.append("CODE_EXECUTE_MISSING_AUTHORIZATION")

    risk_level = (metadata.get("riskLevel") or "").strip().lower()
    if risk_level not in ALLOWED_RISK_LEVELS:
        errors.append("CODE_MISSING_RISK_LEVEL")
    elif risk_level == "critical":
        errors.append("CODE_HIGH_RISK_OPERATION_BLOCKED")
    elif risk_level == "high" and not metadata.get("hasStrongConfirmation"):
        errors.append("CODE_EXECUTE_RISK_CHECK_FAILED")

    executed_roles = []
    if isinstance(runtime_trace, dict):
        for r in runtime_trace.get("agentsExecuted", []) or []:
            if isinstance(r, dict) and r.get("status") in ("completed", "passed"):
                role = r.get("agentRole") or ""
                if role:
                    executed_roles.append(role.lower())
    if "risk checker" not in executed_roles and "risk_checker" not in executed_roles and "riskchecker" not in executed_roles:
        errors.append("CODE_RISK_CHECKER_TRACE_MISSING")
    if "verifier" not in executed_roles:
        errors.append("CODE_VERIFIER_TRACE_MISSING")

    if not has_section(text, "实际执行", "已执行", "执行了", "operation_detail", "change_target"):
        errors.append("CODE_EXECUTE_MISSING_ACTIONS")
    if not has_section(text, "验证结果", "validation result", "已验证"):
        errors.append("CODE_EXECUTE_MISSING_VALIDATION_RESULT")
    if not has_section(text, "回滚", "rollback", "恢复"):
        errors.append("CODE_EXECUTE_MISSING_ROLLBACK")
    if not has_section(text, "执行结果", "result_summary"):
        errors.append("CODE_EXECUTE_MISSING_RESULT")


def run(payload: dict) -> dict:
    classification = payload.get("classification") or {}
    if classification.get("taskType") != "code":
        return fail("CODE_MISSING_OR_INVALID_TASK_TYPE", "code-gate requires taskType=code")
    mode = (payload.get("mode") or "").strip().lower()
    if mode not in ALLOWED_MODES:
        return fail("CODE_MISSING_OR_INVALID_MODE", f"mode must be one of {ALLOWED_MODES}")

    text = normalize_text(payload.get("modelOutput"))
    if not text.strip():
        return fail("CODE_EMPTY_OUTPUT", "modelOutput is empty")

    metadata = payload.get("metadata") or {}
    runtime_trace = payload.get("runtimeRunTrace") or {}

    errors: list[str] = []
    warnings: list[str] = []

    secret_err = check_secrets(text)
    if secret_err:
        errors.append(secret_err)

    if not has_section(text, "实施", "建议", "动作", "actionPlan", "next_action"):
        errors.append("CODE_MISSING_ACTION_PLAN")
    if not has_section(text, "文件", "服务", "目录", "命令", "环境", "system", "file"):
        errors.append("CODE_MISSING_AFFECTED_TARGETS")
    if not has_section(text, "验证", "validation"):
        errors.append("CODE_MISSING_VALIDATION_PLAN")
    if not has_section(text, "回滚", "恢复", "rollback"):
        errors.append("CODE_MISSING_ROLLBACK_PLAN")
    if not has_section(text, "最终回复", "对用户输出", "final_response", "result_summary"):
        warnings.append("CODE_MISSING_FINAL_RESPONSE")

    if mode == "inspect":
        check_inspect(text, metadata, errors)
    else:
        check_execute(text, metadata, runtime_trace, errors)

    risk_level = (metadata.get("riskLevel") or "").strip().lower()
    can_execute = (
        mode == "execute"
        and not errors
        and risk_level in ("low", "medium", "high")
    )

    return gate_result(
        not errors,
        mode,
        errors=errors,
        warnings=warnings,
        required_fixes=list(errors),
        risk_level=risk_level,
        can_execute=can_execute,
        gate_evidence={
            "executedRoles": [
                (r.get("agentRole") if isinstance(r, dict) else "")
                for r in (runtime_trace.get("agentsExecuted") or [])
            ],
        },
    )


def main() -> int:
    raw = sys.stdin.read()
    try:
        payload = json.loads(raw) if raw.strip() else {}
    except json.JSONDecodeError as e:
        result = fail("CODE_INVALID_PAYLOAD", f"invalid input json: {e}")
    else:
        result = run(payload)
    sys.stdout.write(json.dumps(result, ensure_ascii=False))
    sys.stdout.write("\n")
    return 0 if result.get("ok") else 1


if __name__ == "__main__":
    sys.exit(main())
