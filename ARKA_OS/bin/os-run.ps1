param(
  [string]$Agent = "lead-dev-batisseur",
  [string]$Action = "US_CREATE",
  [string]$InputJson = '{"featureId":"FEAT-12","epicId":"EPIC-01","usId":"US-EPIC-01-01","title":"export CSV","kebab_title":"export-csv"}',
  [string]$Runner = "ARKA_CORE/bin/runner.mjs"
)
node $Runner `
  --core   "build/core.assembly.yaml" `
  --profil "build/profiles.bundle.yaml" `
  --agent  "build/assembly.yaml" `
  $Action $InputJson `
  --as-agent $Agent
