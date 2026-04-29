#!/usr/bin/env python3
"""Self-tests for render_markdown_includes.py (run: python3 scripts/test_render_markdown_includes.py)."""
from __future__ import annotations

import contextlib
import importlib.util
import io
import subprocess
import sys
import tempfile
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]


def _load_module():
    path = REPO / "scripts" / "render_markdown_includes.py"
    spec = importlib.util.spec_from_file_location("render_markdown_includes", path)
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _case_relative_chain(tmp: Path) -> None:
    rmi = _load_module()
    (tmp / "sub").mkdir()
    (tmp / "sub" / "leaf.md").write_text("INNER\n", encoding="utf-8")
    (tmp / "mid.md").write_text("mid <!-- include: sub/leaf.md --> end\n", encoding="utf-8")
    (tmp / "root.md").write_text("start <!-- include: mid.md --> finish\n", encoding="utf-8")
    out = tmp / "out.md"
    body = rmi.expand_file((tmp / "root.md").resolve(), [])
    out.write_text(body, encoding="utf-8")
    # mid.md ends with newline; that newline remains before the tail of root.md.
    assert body == "start mid INNER\n end\n finish\n", repr(body)


def _case_absolute_include(tmp: Path) -> None:
    rmi = _load_module()
    abs_target = tmp / "abs_snip.md"
    abs_target.write_text("ABS\n", encoding="utf-8")
    root = tmp / "wrap.md"
    root.write_text(f"before <!-- include: {abs_target} --> after\n", encoding="utf-8")
    body = rmi.expand_file(root.resolve(), [])
    assert body == "before ABS\n after\n", repr(body)


def _case_cli_subprocess(tmp: Path) -> None:
    """Exercise argparse + write path (same as manual runs)."""
    (tmp / "x.md").write_text("<!-- include: y.md -->\n", encoding="utf-8")
    (tmp / "y.md").write_text("Z", encoding="utf-8")
    out = tmp / "cli-out.md"
    script = REPO / "scripts" / "render_markdown_includes.py"
    r = subprocess.run(
        [
            sys.executable,
            str(script),
            "--input",
            str(tmp / "x.md"),
            "--output",
            str(out),
        ],
        capture_output=True,
        text=True,
        cwd=str(REPO),
    )
    assert r.returncode == 0, (r.stdout, r.stderr)
    # x.md has a trailing newline after the include directive.
    assert out.read_text(encoding="utf-8") == "Z\n"


def _case_cycle_fails(tmp: Path) -> None:
    rmi = _load_module()
    (tmp / "a.md").write_text("<!-- include: b.md -->\n", encoding="utf-8")
    (tmp / "b.md").write_text("<!-- include: a.md -->\n", encoding="utf-8")
    buf = io.StringIO()
    with contextlib.redirect_stderr(buf):
        try:
            rmi.expand_file((tmp / "a.md").resolve(), [])
        except SystemExit as e:
            assert e.code == 1, e.code
            err = buf.getvalue()
            assert "Circular include detected" in err, err
            assert str((tmp / "a.md").resolve()) in err, err
            return
    raise AssertionError("expected SystemExit from circular include")


def main() -> int:
    with tempfile.TemporaryDirectory() as td:
        tmp = Path(td)
        _case_relative_chain(tmp)
        _case_absolute_include(tmp)
        _case_cli_subprocess(tmp)
        _case_cycle_fails(tmp)
    print(
        "OK: 4 cases (relative chain, absolute /, CLI subprocess, cycle -> SystemExit 1)",
        file=sys.stderr,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
