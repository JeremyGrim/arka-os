#!/usr/bin/env bash
set -euo pipefail

handler="memory_updated__sync_embeddings"
now() { date -u +"%Y-%m-%dT%H:%M:%SZ"; }

if ! command -v jq >/dev/null 2>&1; then
  printf '{"ts":"%s","level":"error","msg":"jq non disponible","handler":"%s"}\n' "$(now)" "$handler" >&2
  exit 1
fi

scope_hint=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --scope)
      scope_hint="${2:-}";
      shift 2
      ;;
    *)
      shift
      ;;
  esac
done

payload=$(cat)
if [[ -z "$payload" ]]; then
  jq -n \
    --arg ts "$(now)" \
    --arg handler "$handler" \
    '{ts:$ts, level:"error", msg:"Payload JSON manquant", handler:$handler}' >&2
  exit 1
fi

if ! jq empty <<<"$payload" >/dev/null 2>&1; then
  jq -n \
    --arg ts "$(now)" \
    --arg handler "$handler" \
    '{ts:$ts, level:"error", msg:"Payload JSON invalide", handler:$handler}' >&2
  exit 1
fi

event_name=$(jq -r '.event // "UNKNOWN_EVENT"' <<<"$payload")
us_id=$(jq -r '.scope.usId // empty' <<<"$payload" || true)
status=$(jq -r '.details.status // empty' <<<"$payload" || true)
trace_id=$(jq -r '.trace_id // .traceId // empty' <<<"$payload" || true)

extras=$(jq -n \
  --arg event "$event_name" \
  --arg us "${us_id:-}" \
  --arg status "${status:-}" \
  --arg scope "$scope_hint" \
  --arg trace "$trace_id" \
  '{event:$event, scope_us:($us|select(. != "")), status:($status|select(. != "")), requested_scope:($scope|select(. != "")), trace_id:($trace|select(. != ""))} | with_entries(select(.value != null))')

jq -n \
  --arg ts "$(now)" \
  --arg handler "$handler" \
  --argjson extra "$extras" \
  '{ts:$ts, level:"info", msg:"Synchronisation embeddings déclenchée", handler:$handler} + $extra'

# Ici, appelez votre pipeline d'indexation si nécessaire.
# Exemple : python3 scripts/embeddings/index.py --us "$us_id" --payload <(printf '%s' "$payload")
