#!/usr/bin/env python3
"""
One-shot patch: set gateway.controlUi.allowedOrigins to ["*"] so the OpenClaw
Control UI WebSocket accepts browsers from any machine (fixes origin not allowed).

Run on the host where the gateway runs, then restart the gateway process.

Security: "*" is convenient for small teams / lab use. On a public IP, anyone who
can reach the gateway port could try the Control UI handshake — keep token auth
strong and firewall/security groups tight.

Default config path: ~/.openclaw/openclaw.json
Override: OPENCLAW_CONFIG_JSON=/path/to/openclaw.json
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
from datetime import datetime, timezone
from pathlib import Path


def default_config_path() -> Path:
    override = (os.environ.get("OPENCLAW_CONFIG_JSON") or "").strip()
    if override:
        return Path(override).expanduser()
    return Path.home() / ".openclaw" / "openclaw.json"


def load_or_empty(path: Path) -> dict:
    if not path.exists():
        return {}
    raw = path.read_text(encoding="utf-8")
    if not raw.strip():
        return {}
    return json.loads(raw)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="print the new JSON only; do not write",
    )
    args = parser.parse_args()

    path = default_config_path()
    data = load_or_empty(path)
    if not isinstance(data, dict):
        raise SystemExit(f"refuse: root JSON must be an object, got {type(data).__name__}")

    gw = data.get("gateway")
    if gw is None:
        data["gateway"] = {}
        gw = data["gateway"]
    if not isinstance(gw, dict):
        raise SystemExit('refuse: "gateway" must be an object')

    cu = gw.get("controlUi")
    if cu is None:
        gw["controlUi"] = {}
        cu = gw["controlUi"]
    if not isinstance(cu, dict):
        raise SystemExit('refuse: "gateway.controlUi" must be an object')

    before = cu.get("allowedOrigins")
    cu["allowedOrigins"] = ["*"]

    out = json.dumps(data, indent=2, ensure_ascii=False) + "\n"

    print(f"config: {path}")
    print(f"allowedOrigins before: {before!r}")
    print('allowedOrigins after:  ["*"]')

    if args.dry_run:
        print("--- dry-run, not writing ---")
        print(out)
        return 0

    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists():
        ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        bak = path.with_suffix(path.suffix + f".bak.{ts}")
        shutil.copy2(path, bak)
        print(f"backup: {bak}")

    path.write_text(out, encoding="utf-8")
    print("wrote OK. Restart the OpenClaw gateway (however you start it: systemd, tmux, etc.).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
