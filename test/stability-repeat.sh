#!/usr/bin/env bash
# 连续多轮跑同一批单测，降低偶发 flaky 漏检
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
REPEAT="${TEST_STABILITY_REPEAT:-5}"
for i in $(seq 1 "$REPEAT"); do
  echo "=== stability ${i}/${REPEAT} ==="
  node --test test/*.test.js
done
echo "=== stability: ${REPEAT} passes ok ==="
