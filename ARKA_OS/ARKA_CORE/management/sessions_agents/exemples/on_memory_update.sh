#!/usr/bin/env bash
set -euo pipefail
EVENT_JSON="$(cat)" # payload on stdin
SCOPE_US=${1:-}
jq -e . >/dev/null 2>&1 <<<"${EVENT_JSON}" || { echo "Invalid JSON" >&2; exit 1; }
echo "[MEMORY_UPDATE] scope(US=${SCOPE_US}) profile=${ARKA_PROFILE:-unknown}"
# TODO: add custom logic (e.g., sync embeddings, refresh dashboard)