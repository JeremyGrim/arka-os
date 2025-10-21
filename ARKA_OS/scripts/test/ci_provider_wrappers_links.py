#!/usr/bin/env python3
# ci_provider_wrappers_links.py — vérifie que chaque wrapper .openAi-provider a une ligne d'ancrage vers l'onboarding client
import sys, re, json
from pathlib import Path

BASE = Path(sys.argv[1]) if len(sys.argv)>1 else Path(".")
root = BASE / ".openAi-provider"
errors = []
checked = 0

if not root.exists():
    print(json.dumps({"checked": 0, "errors": ["dossier .openAi-provider introuvable"], "ok": False}, ensure_ascii=False))
    sys.exit(1)

for role_dir in root.iterdir():
    if not role_dir.is_dir():
        continue
    if not role_dir.name.startswith(".codex-"):
        continue
    ob = role_dir / "onboarding.md"
    wl = role_dir / "WAKEUP-LINK.md"
    for p in (ob, wl):
        if not p.exists():
            errors.append(f"{p} manquant"); continue
        txt = p.read_text(encoding="utf-8", errors="ignore")
        if re.search(r"clients/.+?/agents/.+?/onboarding\.ya?ml", txt, re.I) is None:
            errors.append(f"{p} ne contient pas de lien vers clients/<CLIENT>/agents/<role>/onboarding.yaml")
        checked += 1

print(json.dumps({"checked": checked, "errors": errors, "ok": len(errors)==0}, ensure_ascii=False, indent=2))
if errors: sys.exit(1)
