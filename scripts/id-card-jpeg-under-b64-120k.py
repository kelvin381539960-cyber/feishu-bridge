#!/usr/bin/env python3
"""Encode ID card JPEG so standard Base64 length <= 120000 (many gov apps check this)."""
from __future__ import annotations

import base64
import subprocess
import sys
from pathlib import Path


def b64_len(raw: bytes) -> int:
    return len(base64.b64encode(raw))


def ffmpeg_q(src: Path, dst: Path, q: int, scale_pct: int | None = None) -> None:
    vf = []
    if scale_pct is not None:
        vf.append(f"scale=iw*{scale_pct}//100:-1")
    args = [
        "ffmpeg",
        "-y",
        "-loglevel",
        "error",
        "-i",
        str(src),
    ]
    if vf:
        args += ["-vf", ",".join(vf)]
    args += ["-q:v", str(q), "-map_metadata", "-1", str(dst)]
    subprocess.run(args, check=True)


def best_jpeg(src: Path, dst: Path, max_b64: int = 120000) -> tuple[int, int, int]:
    """Return (q, raw_len, b64_len)."""
    lo, hi = 2, 31
    best_q: int | None = None
    while lo <= hi:
        mid = (lo + hi) // 2
        ffmpeg_q(src, dst, mid)
        raw = dst.read_bytes()
        L = b64_len(raw)
        if L <= max_b64:
            best_q = mid
            hi = mid - 1
        else:
            lo = mid + 1
    if best_q is not None:
        ffmpeg_q(src, dst, best_q)
        raw = dst.read_bytes()
        return best_q, len(raw), b64_len(raw)

    for sc in range(95, 49, -5):
        lo, hi = 2, 31
        bq = None
        while lo <= hi:
            mid = (lo + hi) // 2
            ffmpeg_q(src, dst, mid, scale_pct=sc)
            raw = dst.read_bytes()
            L = b64_len(raw)
            if L <= max_b64:
                bq = mid
                hi = mid - 1
            else:
                lo = mid + 1
        if bq is not None:
            ffmpeg_q(src, dst, bq, scale_pct=sc)
            raw = dst.read_bytes()
            return bq, len(raw), b64_len(raw)

    raise RuntimeError("could not fit under max_b64 even at min scale")


def main() -> None:
    if len(sys.argv) not in (3, 4):
        print(
            "usage: id-card-jpeg-under-b64-120k.py <src.png> <dst.jpg> [max_b64]",
            file=sys.stderr,
        )
        sys.exit(2)
    src = Path(sys.argv[1])
    dst = Path(sys.argv[2])
    max_b64 = int(sys.argv[3]) if len(sys.argv) == 4 else 120000
    q, raw_len, bl = best_jpeg(src, dst, max_b64=max_b64)
    print(dst, "q:v", q, "raw", raw_len, "b64_len", bl, "max_b64", max_b64)


if __name__ == "__main__":
    main()
