#!/usr/bin/env python3
"""
research-gate.py — Research workflow Gate（clarify / execute 双模式）

只判断输出是否合格；不修复、不调用 LLM、不联网。

runtimeRunTrace / multiAgent 留痕由 verify-workflow-gates.py 在分发本脚本之前统一校验
（SPECIALIZED_TRACE_REQUIRED、SOLO_TRACE_INCOMPLETE、AGENTS_PLAN_NOT_FULFILLED 等）。
本脚本仅校验 modelOutput 正文结构与长度。

输入 JSON：
{
  "classification": { "taskType": "research", ... },
  "mode": "clarify" | "execute",
  "modelOutput": "<text>",
  "expectedOutput": { ... }   # 可选
}

输出 JSON：
{ ok, workflow, mode, errors, warnings, requiredFixes }
"""

from __future__ import annotations

import json
import re
import sys

ALLOWED_MODES = ("clarify", "execute")

EXECUTE_REQUIRED_SECTIONS = (
    ("title", re.compile(r"(?:^|\n)#\s+\S", re.MULTILINE)),
    ("intent_or_scope", re.compile(r"(用户意图|调研范围|背景与范围|range|scope)", re.IGNORECASE)),
    ("summary", re.compile(r"(执行摘要|摘要|结论先行|TL;DR|tl;dr)", re.IGNORECASE)),
    ("background_or_definition", re.compile(r"(背景|定义|术语|概念)")),
    ("analysis_framework", re.compile(r"(分析|判断框架|对比|比较)")),
    ("findings", re.compile(r"(发现|结论|关键洞察)")),
    ("risks_or_uncertainty", re.compile(r"(风险|局限|不确定性|限制)")),
    ("recommendation", re.compile(r"(建议|结论与建议|推荐|下一步)")),
    ("references", re.compile(r"(参考|来源|引用|reference|source)", re.IGNORECASE)),
)

CLARIFY_QUESTION_RE = re.compile(r"[?？]")
SHALLOW_QUESTION_RE = re.compile(r"^(请补充信息|请提供更多信息|请明确)\s*[?？]?\s*$")


def fail(code: str, reason: str, **extra) -> dict:
    return {"ok": False, "code": code, "reason": reason, **extra}


def gate_result(passed: bool, mode: str, errors=None, warnings=None, required_fixes=None) -> dict:
    return {
        "ok": passed,
        "workflow": "research",
        "mode": mode,
        "errors": errors or [],
        "warnings": warnings or [],
        "requiredFixes": required_fixes or [],
    }


def check_clarify(text: str) -> dict:
    errors: list[str] = []
    warnings: list[str] = []

    questions = [ln.strip() for ln in text.splitlines() if CLARIFY_QUESTION_RE.search(ln)]
    if not questions:
        errors.append("RESEARCH_CLARIFY_NO_QUESTION")
    if len(questions) > 5:
        warnings.append("RESEARCH_CLARIFY_TOO_MANY_QUESTIONS")
    for q in questions:
        if SHALLOW_QUESTION_RE.search(q):
            errors.append("RESEARCH_CLARIFY_SHALLOW_QUESTION")
            break

    forbidden = ["调研结论", "执行摘要", "结论与建议"]
    for kw in forbidden:
        if kw in text:
            errors.append("RESEARCH_CLARIFY_NOT_REPORT_BODY")
            break

    return gate_result(
        not errors,
        "clarify",
        errors=errors,
        warnings=warnings,
        required_fixes=[e for e in errors],
    )


def check_execute(text: str) -> dict:
    errors: list[str] = []
    missing: list[str] = []
    for label, pat in EXECUTE_REQUIRED_SECTIONS:
        if not pat.search(text):
            missing.append(label)
    if missing:
        errors.append("RESEARCH_EXECUTE_MISSING_SECTIONS")
    if len(text) < 800:
        errors.append("RESEARCH_EXECUTE_OUTPUT_TOO_SHORT")
    if "假设" in text and not re.search(r"(澄清|假设|不确定)", text):
        errors.append("RESEARCH_EXECUTE_ASSUMPTION_NOT_FLAGGED")
    return gate_result(
        not errors,
        "execute",
        errors=errors,
        required_fixes=[
            *(f"missing_section:{m}" for m in missing),
            *(e for e in errors if not e.startswith("RESEARCH_EXECUTE_MISSING_SECTIONS")),
        ],
    )


def run(payload: dict) -> dict:
    classification = payload.get("classification") or {}
    if classification.get("taskType") != "research":
        return fail("RESEARCH_INVALID_TASK_TYPE", "research-gate requires taskType=research")
    mode = (payload.get("mode") or "").strip()
    if mode not in ALLOWED_MODES:
        return fail("RESEARCH_INVALID_MODE", f"mode must be one of {ALLOWED_MODES}")
    text = payload.get("modelOutput") or ""
    if not isinstance(text, str) or not text.strip():
        return fail("RESEARCH_EMPTY_OUTPUT", "modelOutput is empty")
    return check_clarify(text) if mode == "clarify" else check_execute(text)


def main() -> int:
    raw = sys.stdin.read()
    try:
        payload = json.loads(raw) if raw.strip() else {}
    except json.JSONDecodeError as e:
        result = fail("RESEARCH_INVALID_PAYLOAD", f"invalid input json: {e}")
    else:
        result = run(payload)
    sys.stdout.write(json.dumps(result, ensure_ascii=False))
    sys.stdout.write("\n")
    return 0 if result.get("ok") else 1


if __name__ == "__main__":
    sys.exit(main())
