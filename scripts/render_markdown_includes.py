#!/usr/bin/env python3
"""
Expand <!-- include: path --> directives in Markdown.

- Path starting with ``/``: treated as an absolute filesystem path (resolved with
  Path.resolve); not joined with the containing file's directory.
- Any other path: resolved relative to the directory of the file that contains
  the directive (not the CLI cwd, except for the initial --input path).

Does not modify the input file unless --output points to the same path.
"""
from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

# Single-line only: avoids accidental multiline matches.
INCLUDE_RE = re.compile(r"<!--\s*include:\s*([^\n]+?)\s*-->")


def _die(msg: str) -> None:
    print(msg, file=sys.stderr)
    raise SystemExit(1)


def expand_file(abs_path: Path, stack: list[Path]) -> str:
    """
    Read abs_path (UTF-8), replace each include directive with fully expanded content.

    :param abs_path: Path to the file to expand (may be unresolved; normalized inside).
    :param stack: Resolved absolute paths of files in the current expansion chain
                  (ancestor includes). Used for cycle detection.
    """
    resolved = abs_path.resolve()
    if resolved in stack:
        chain = " -> ".join(str(p) for p in stack) + f" -> {resolved}"
        _die(f"Circular include detected:\n  {chain}")

    if not resolved.is_file():
        parent_hint = stack[-1] if stack else None
        if parent_hint is not None:
            _die(f"Include target not found: {resolved}\n  Referenced from: {parent_hint}")
        _die(f"File not found: {resolved}")

    text = resolved.read_text(encoding="utf-8")
    parent_dir = resolved.parent
    new_stack = stack + [resolved]

    parts: list[str] = []
    last_end = 0
    for m in INCLUDE_RE.finditer(text):
        parts.append(text[last_end : m.start()])
        raw_path = m.group(1).strip()
        directive = m.group(0)
        if not raw_path:
            _die(
                f"Empty include path in directive: {directive!r}\n"
                f"  In file: {resolved}"
            )

        # Leading ``/`` => absolute path; otherwise relative to this file's directory.
        if raw_path.startswith("/"):
            target = Path(raw_path).resolve()
        else:
            target = (parent_dir / raw_path).resolve()
        if not target.is_file():
            _die(
                f"Include target not found: {target}\n"
                f"  Referenced from: {resolved}\n"
                f"  Directive: {directive}"
            )

        parts.append(expand_file(target, new_stack))
        last_end = m.end()

    parts.append(text[last_end:])
    return "".join(parts)


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Render Markdown by expanding <!-- include: path --> directives."
    )
    parser.add_argument(
        "--input",
        type=Path,
        required=True,
        help="Input Markdown file",
    )
    parser.add_argument(
        "--output",
        type=Path,
        required=True,
        help="Output Markdown file (may equal --input for in-place update)",
    )
    args = parser.parse_args()

    inp = args.input.expanduser()
    out = args.output.expanduser()

    # Resolve relative to cwd for the entry paths only.
    inp_abs = inp.resolve()
    out_abs = out.resolve()

    if not inp_abs.is_file():
        _die(f"Input file not found: {inp_abs}")

    body = expand_file(inp_abs, [])

    out_abs.parent.mkdir(parents=True, exist_ok=True)
    out_abs.write_text(body, encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
