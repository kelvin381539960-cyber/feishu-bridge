#!/usr/bin/env python3
"""
兼容入口：历史上 CI/文档引用 `verify-prd-brief-gate.py`。
实际校验逻辑已合并至 `verify-prd-gates.py`（Brief + outline + _state + _review）。

用法：仓库根目录执行  python3 scripts/verify-prd-brief-gate.py
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GATES = ROOT / "scripts" / "verify-prd-gates.py"


def main() -> int:
    return subprocess.call([sys.executable, str(GATES)])


if __name__ == "__main__":
    raise SystemExit(main())
