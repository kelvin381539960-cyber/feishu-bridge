#!/usr/bin/env bash
# Merge Cursor state.vscdb chat-related rows from SOURCE into TARGET without overwriting.
# Run on the machine that holds the files (e.g. macOS). Quit Cursor before running.
#
# Usage:
#   TARGET="/path/to/target/state.vscdb" SOURCE="/path/to/source/state.vscdb" bash scripts/merge-cursor-state-vscdb.sh
#
# Migrate a local chat session INTO a Cursor cloud workspace (opened at least once locally):
#   TARGET = .../Cursor/User/workspaceStorage/21dfeb6fcbd100eb77dce4babc6e4134/state.vscdb
#   SOURCE = .../Cursor/User/workspaceStorage/<hash-of-workspace-where-the-chat-lived>/state.vscdb
#   (Use Cursor “Open Workspace Storage Folder” or inspect workspaceStorage for the correct hash.)
#
# Defaults (Kelvin's paths — override if different):
#   TARGET: /Users/kelvin/Library/Application Support/Cursor/User/workspaceStorage/state.vscdb
#   SOURCE: $HOME/Downloads/21dfeb6fcbd100eb77dce4babc6e4134/state.vscdb

set -euo pipefail

DEFAULT_TARGET="/Users/kelvin/Library/Application Support/Cursor/User/workspaceStorage/state.vscdb"
DEFAULT_SOURCE="${HOME}/Downloads/21dfeb6fcbd100eb77dce4babc6e4134/state.vscdb"

TARGET="${TARGET:-$DEFAULT_TARGET}"
SOURCE="${SOURCE:-$DEFAULT_SOURCE}"

if [[ ! -f "$TARGET" ]]; then
  echo "ERROR: Target DB not found: $TARGET" >&2
  exit 1
fi
if [[ ! -f "$SOURCE" ]]; then
  echo "ERROR: Source DB not found: $SOURCE" >&2
  exit 1
fi

if ! command -v sqlite3 >/dev/null 2>&1; then
  echo "ERROR: sqlite3 not in PATH" >&2
  exit 1
fi

TS="$(date +%Y%m%d-%H%M%S)"
BACKUP="${TARGET}.backup-${TS}"
cp -p "$TARGET" "$BACKUP"
echo "Backup created: $BACKUP"

# Discover tables whose names suggest chat / Cursor conversation storage (case-insensitive).
# Extend PATTERN if your schema uses other names.
CHAT_PATTERN='chat|message|conversation|thread|composer|cursor.*chat|aichat|bubble'

list_tables() {
  local db="$1"
  sqlite3 "$db" "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name;"
}

merge_report="$(mktemp)"
trap 'rm -f "$merge_report"' EXIT

escape_sql_literal() {
  printf '%s' "$1" | sed "s/'/''/g"
}

# Tables present in BOTH databases and matching chat-related name heuristic
mapfile -t ALL_TARGET < <(list_tables "$TARGET")
mapfile -t ALL_SOURCE < <(list_tables "$SOURCE")

candidates=()
for t in "${ALL_TARGET[@]}"; do
  for s in "${ALL_SOURCE[@]}"; do
    if [[ "$t" == "$s" ]] && echo "$t" | grep -Eiq "$CHAT_PATTERN"; then
      candidates+=("$t")
      break
    fi
  done
done

# Always include ItemTable if present in both — Cursor often stores KV chat state here
for special in ItemTable; do
  has_t=0 has_s=0
  for x in "${ALL_TARGET[@]}"; do [[ "$x" == "$special" ]] && has_t=1; done
  for x in "${ALL_SOURCE[@]}"; do [[ "$x" == "$special" ]] && has_s=1; done
  if [[ "$has_t" -eq 1 && "$has_s" -eq 1 ]]; then
    found=0
    for c in "${candidates[@]}"; do [[ "$c" == "$special" ]] && found=1; done
    if [[ "$found" -eq 0 ]]; then
      candidates+=("$special")
    fi
  fi
done

if [[ ${#candidates[@]} -eq 0 ]]; then
  echo "No chat-related tables found in both DBs. Listing all common tables for inspection:" >&2
  comm -12 <(printf '%s\n' "${ALL_TARGET[@]}" | sort) <(printf '%s\n' "${ALL_SOURCE[@]}" | sort) | head -50
  echo "" >&2
  echo "Set CHAT_PATTERN to a broader regex or merge specific tables manually." >&2
  exit 2
fi

echo "Tables to merge (INSERT OR IGNORE): ${candidates[*]}"

sql_body=""
for tbl in "${candidates[@]}"; do
  cols_t="$(sqlite3 "$TARGET" "PRAGMA table_info(\"$tbl\");")"
  cols_s="$(sqlite3 "$SOURCE" "PRAGMA table_info(\"$tbl\");")"
  if [[ "$cols_t" != "$cols_s" ]]; then
    echo "SKIP (schema mismatch): $tbl" | tee -a "$merge_report"
    continue
  fi
  col_names="$(sqlite3 "$TARGET" "PRAGMA table_info(\"$tbl\");" | awk -F'|' '{print $2}' | paste -sd, -)"
  if [[ -z "$col_names" ]]; then
    echo "SKIP (no columns): $tbl" | tee -a "$merge_report"
    continue
  fi
  line="$(printf 'INSERT OR IGNORE INTO main.\"%s\" SELECT %s FROM src.\"%s\";' "$tbl" "$col_names" "$tbl")"
  sql_body+="${line}"$'\n'
done

if [[ -z "$sql_body" ]]; then
  echo "ERROR: No tables had matching schemas to merge." >&2
  exit 3
fi

src_lit="$(escape_sql_literal "$SOURCE")"

sqlite3 "$TARGET" <<SQL
ATTACH DATABASE '${src_lit}' AS src;
BEGIN IMMEDIATE;
${sql_body}
COMMIT;
PRAGMA main.wal_checkpoint(TRUNCATE);
DETACH DATABASE src;
SQL

echo "Merge SQL executed on target."

# Remove WAL/SHM only after checkpoint (user-requested). Safe if Cursor is quit.
for ext in wal shm; do
  f="${TARGET}.${ext}"
  if [[ -f "$f" ]]; then
    rm -f "$f"
    echo "Removed: $f"
  fi
done

if [[ -s "$merge_report" ]]; then
  echo "--- Skipped tables ---"
  cat "$merge_report"
fi

echo "Done. Backup: $BACKUP"
