#!/usr/bin/env bash
# scan-governance-residue.sh
#
# 扫描"主体代码与文档"中是否还残留旧治理术语：qa / debug / P0 / P2 / 旧 mode 名称。
# 仅扫描下面的目录白名单，跳过 node_modules、test/ 历史用例、契约/registry/gate 自身（它们必须
# 显式列出禁止术语用于校验，命中是合法的）。
#
# 退出码：
#   0  无 blocker 残留
#   1  发现 blocker 残留（warning 不导致失败）
#
# 用法：
#   bash scripts/scan-governance-residue.sh
#   STRICT=1 bash scripts/scan-governance-residue.sh   # 把 docs/草稿 也纳入扫描

set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if ! command -v rg >/dev/null 2>&1; then
  echo "[FAIL] ripgrep (rg) 未安装。" >&2
  exit 2
fi

# 主体代码扫描目录
TARGET_DIRS=(
  "lib"
  "scripts"
  "deploy"
  "docs/cursor-architecture"
)

# 扫描词（治理 residue：分类字面量 / 优先级标签 / 旧 mode 名）
# 注意：不能直接扫 \bqa\b/\bdebug\b，会大量命中合法变量名（qaContext / debug 日志标签）。
# 这里只命中"作为字面值出现"的 qa/debug，以及大写优先级标签 P0/P2 与已废弃 mode 名。
PATTERNS=(
  "['\"](qa|debug)['\"]"
  'taskType:\s*['\''"](qa|debug)['\''"]'
  'workflowKey:\s*['\''"](qa|debug)['\''"]'
  'mode:\s*['\''"](qa|debug|custom_mode|legacy_mode)['\''"]'
  '[[:space:]"|=:,]P0[[:space:]"|=:,.\)]'
  '[[:space:]"|=:,]P2[[:space:]"|=:,.\)]'
  'custom_mode'
  'legacy_mode'
)

# 受保护文件（命中是预期的：契约/gate/adapter/这个脚本本身/Plan）
ALLOWED_FILES_RE='(scripts/scan-governance-residue\.sh|scripts/runtime-smoke-tests\.js|scripts/code-gate\.py|scripts/research-gate\.py|scripts/solution-gate\.py|scripts/verify-workflow-gates\.py|lib/feishu-cursor/runtime/multi-agent-runtime-guards\.js|lib/feishu-cursor/runtime/pipeline-gate-adapter\.js|lib/feishu-cursor/runtime/run-trace-recorder\.js|lib/feishu-cursor/runtime/specialized-solo-runner\.js|lib/feishu-cursor/conversation-reset\.js|lib/feishu-cursor/failed-research-snapshot-store\.js|lib/openclaw-control-plane/workflow-execution-policy\.js|lib/feishu-cursor/contracts/.+\.contract\.js|lib/feishu-cursor/contracts/index\.js|lib/feishu-cursor/workflows/workflow-registry\.js|lib/feishu-cursor/policies/task-classifier\.js|.*\.md$)'

violations=0
warnings=0

for dir in "${TARGET_DIRS[@]}"; do
  if [[ ! -e "$dir" ]]; then continue; fi
  for pat in "${PATTERNS[@]}"; do
    while IFS= read -r line; do
      file="${line%%:*}"
      if [[ "$file" =~ test/.+\.test\.js$ ]] || [[ "$file" =~ ^docs/ ]]; then
        echo "[warning] pattern=${pat} ${line}"
        warnings=$((warnings + 1))
        continue
      fi
      if [[ "$file" =~ $ALLOWED_FILES_RE ]]; then
        continue
      fi
      echo "[residue] pattern=${pat} ${line}"
      violations=$((violations + 1))
    done < <(rg --line-number --no-heading -e "$pat" "$dir" 2>/dev/null)
  done
done

if [[ "${STRICT:-0}" == "1" ]]; then
  for pat in "${PATTERNS[@]}"; do
    while IFS= read -r line; do
      file="${line%%:*}"
      if [[ "$file" =~ test/.+\.test\.js$ ]] || [[ "$file" =~ ^docs/ ]]; then
        echo "[warning-strict] pattern=${pat} ${line}"
        warnings=$((warnings + 1))
        continue
      fi
      if [[ "$file" =~ $ALLOWED_FILES_RE ]]; then
        continue
      fi
      echo "[residue-strict] pattern=${pat} ${line}"
      violations=$((violations + 1))
    done < <(rg --line-number --no-heading -e "$pat" "docs" 2>/dev/null | grep -v 'docs/cursor-architecture' | grep -v 'docs/prd' || true)
  done
fi

if [[ "$violations" -gt 0 ]]; then
  echo ""
  echo "[FAIL] governance residue (blocker) detected: $violations 处" >&2
  exit 1
fi

if [[ "$warnings" -gt 0 ]]; then
  echo "[info] governance warnings (non-blocking): $warnings 处"
fi

echo "[ok] no governance residue under: ${TARGET_DIRS[*]}"
exit 0
