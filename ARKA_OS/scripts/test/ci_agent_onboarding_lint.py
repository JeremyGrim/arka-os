#!/usr/bin/env python3
# ci_agent_onboarding_lint.py — valide les onboarding et l'index agents
import sys, yaml, json
from pathlib import Path

BASE = Path(sys.argv[1]) if len(sys.argv)>1 else Path(".")

index_p = BASE / "ARKA_OS/ARKA_AGENT/AGENT00-INDEX.yaml"
def load_yaml(p): 
    return yaml.safe_load(p.read_text(encoding="utf-8")) or {}

idx = load_yaml(index_p)
errors = []

for role, ref in (idx.get("experts") or {}).items():
    p = BASE / "ARKA_OS/ARKA_AGENT" / ref
    if not p.exists():
        errors.append({"role": role, "error": f"expert.yaml manquant: {ref}"})

for client, agents in (idx.get("clients") or {}).items():
    for aid, ref in (agents or {}).items():
        p = BASE / "ARKA_OS/ARKA_AGENT" / ref
        if not p.exists():
            errors.append({"client": client, "agent_id": aid, "error": f"onboarding manquant: {ref}"})
        else:
            y = load_yaml(p)
            for key in ["role","expert_ref","wakeup_ref","runtime","messaging","memory","policy"]:
                if key not in y:
                    errors.append({"client": client, "agent_id": aid, "error": f"champ '{key}' manquant"})

print(json.dumps({"errors": errors, "ok": len(errors)==0}, ensure_ascii=False, indent=2))
if errors: sys.exit(1)
