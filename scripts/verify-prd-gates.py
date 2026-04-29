#!/usr/bin/env python3
"""
PRD 综合门禁（Brief + outline_status + 状态一行文件 + frozen 时评审落盘）。

用法（仓库根目录）：
  python3 scripts/verify-prd-gates.py
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PRD_DIR = ROOT / "docs" / "prd"

ALLOWED_BRIEF = frozenset({"confirmed", "skipped_questions_confirmed"})
ALLOWED_OUTLINE = frozenset({"draft", "frozen"})
ALLOWED_STATE = frozenset(
    {
        "new_request",
        "clarification_answered",
        "brief_draft",
        "brief_confirmed",
        "outline_draft",
        "outline_frozen",
        "prd_draft",
        "review_done",
        "prd_revised",
        "final_confirmed",
    }
)

STATE_LINE = re.compile(r"^prd_workflow_state=([a-z_]+)\s*$")

FM_BOUND = re.compile(r"^---\s*$", re.MULTILINE)


def extract_front_matter(text: str) -> tuple[str | None, str]:
    """Returns (front_matter_without_delims, body_after_fm)."""
    if not text.startswith("---"):
        return None, text
    m = list(FM_BOUND.finditer(text))
    if len(m) < 2:
        return None, text
    fm = text[m[0].end() : m[1].start()]
    body = text[m[1].end() :].lstrip("\n")
    return fm, body


def fm_get(fm: str, key: str) -> str | None:
    pat = re.compile(rf"^{re.escape(key)}:\s*(.+?)\s*$", re.MULTILINE)
    m = pat.search(fm)
    if not m:
        return None
    v = m.group(1).strip()
    if (v.startswith('"') and v.endswith('"')) or (v.startswith("'") and v.endswith("'")):
        v = v[1:-1]
    return v


def load_keys(path: Path, keys: tuple[str, ...]) -> dict[str, str | None]:
    raw = path.read_text(encoding="utf-8")
    fm, _body = extract_front_matter(raw)
    if fm is None:
        return {k: None for k in keys}
    return {k: fm_get(fm, k) for k in keys}


def topic_slug_from_prd(path: Path) -> str:
    stem = path.stem  # e.g. user-registration-prd
    if not stem.endswith("-prd"):
        raise ValueError(f"unexpected PRD filename (expected *-prd.md): {path.name}")
    return stem[: -len("-prd")]


def read_state_line(path: Path) -> tuple[str | None, str | None]:
    """Returns (state_value, error_message)."""
    if not path.is_file():
        return None, "文件不存在"
    raw = path.read_text(encoding="utf-8")
    # 允许文件末尾单个换行；禁止第二行非空内容
    lines = [ln for ln in raw.splitlines() if ln.strip() != ""]
    if len(lines) != 1:
        return None, f"必须恰好一行非空内容，当前 {len(lines)} 行"
    m = STATE_LINE.match(lines[0].strip())
    if not m:
        return None, f"格式须为 prd_workflow_state=<状态>，当前: {lines[0]!r}"
    st = m.group(1)
    if st not in ALLOWED_STATE:
        return None, f"未知状态 {st!r}，须在 {sorted(ALLOWED_STATE)} 内"
    return st, None


def review_body_chars(path: Path) -> int:
    raw = path.read_text(encoding="utf-8")
    _fm, body = extract_front_matter(raw)
    return len(body.strip())


def main() -> int:
    if not PRD_DIR.is_dir():
        print("verify-prd-gates: ok (no docs/prd/)", file=sys.stderr)
        return 0

    prd_files = sorted(PRD_DIR.glob("*-prd.md"))
    errors: list[str] = []

    for prd in prd_files:
        rel = prd.relative_to(ROOT).as_posix()
        data = load_keys(prd, ("brief_path", "brief_status", "outline_status"))
        st = data["brief_status"]
        bp = data["brief_path"]
        outline = data["outline_status"]

        if st is None:
            errors.append(f"{rel}: 缺少 front matter 字段 brief_status")
        elif st not in ALLOWED_BRIEF:
            errors.append(
                f"{rel}: brief_status 必须为 confirmed 或 skipped_questions_confirmed，当前为 {st!r}"
            )

        if bp is None:
            errors.append(f"{rel}: 缺少 front matter 字段 brief_path")
        else:
            brief = ROOT / bp
            if not brief.is_file():
                errors.append(f"{rel}: brief_path 指向的文件不存在: {bp}")
            else:
                b = load_keys(brief, ("brief_status",))
                bs = b["brief_status"]
                if bs is None:
                    errors.append(f"{bp}: Brief 文件缺少 brief_status")
                elif bs not in ALLOWED_BRIEF:
                    errors.append(
                        f"{bp}: brief_status 须为 confirmed 或 skipped_questions_confirmed，当前为 {bs!r}"
                    )

        if outline is None:
            errors.append(f"{rel}: 缺少 front matter 字段 outline_status（须为 draft 或 frozen）")
        elif outline not in ALLOWED_OUTLINE:
            errors.append(f"{rel}: outline_status 须为 draft 或 frozen，当前为 {outline!r}")

        try:
            slug = topic_slug_from_prd(prd)
        except ValueError as e:
            errors.append(f"{rel}: {e}")
            continue

        state_path = PRD_DIR / f"_state-{slug}.md"
        sv, serr = read_state_line(state_path)
        if serr:
            errors.append(f"{state_path.relative_to(ROOT).as_posix()}: {serr}")
        elif sv is None:
            errors.append(f"{state_path.relative_to(ROOT).as_posix()}: 无法解析状态")

        if outline == "frozen":
            review_path = PRD_DIR / f"_review-{slug}.md"
            if not review_path.is_file():
                errors.append(
                    f"{rel}: outline_status=frozen 但缺少评审落盘 {review_path.relative_to(ROOT).as_posix()}"
                )
            else:
                n = review_body_chars(review_path)
                if n < 80:
                    errors.append(
                        f"{review_path.relative_to(ROOT).as_posix()}: 评审正文过短（除去 front matter 后须 ≥80 字符），当前 {n}"
                    )

    if errors:
        print("verify-prd-gates: FAILED", file=sys.stderr)
        for e in errors:
            print(f"  - {e}", file=sys.stderr)
        return 1

    print(f"verify-prd-gates: ok ({len(prd_files)} PRD(s))", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
