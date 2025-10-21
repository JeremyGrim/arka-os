#!/usr/bin/env bash
set -euo pipefail
export GITHUB_REPO="owner/repo"     # à définir
export GITHUB_TOKEN="ghp_xxx"       # à définir
# Simule un event US_CREATED et appelle le handler local
EVENT='{"event":"US_CREATED","ts":"2025-09-27T10:00:00Z","source_brick":"ARKORE16","scope":{"featureId":"FEAT-12","epicId":"EPIC-FEAT-12-03","usId":"US-EPIC-12-03-07"},"details":{"title":"export CSV","summary":"Permettre l’export des données en CSV"}}'
echo "$EVENT" | scripts/handlers/us_created__issue_links.js --provider github