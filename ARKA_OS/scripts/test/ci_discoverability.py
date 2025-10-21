#!/usr/bin/env python3
# ci_discoverability.py — Garantit la découvrabilité complète intents/flows/docs/agents
import sys, json, yaml
from pathlib import Path

BASE = Path(sys.argv[1]) if len(sys.argv)>1 else Path(".")
os_root = (BASE / "ARKA_OS").resolve()
flow_root = os_root / "ARKA_FLOW"
core_root = os_root / "ARKA_CORE"

def load_yaml(p):
    return yaml.safe_load(p.read_text(encoding="utf-8")) or {}

manifest = load_yaml(flow_root/"bricks"/"ARKFLOW-00-MANIFEST.yaml")
router   = load_yaml(flow_root/"router"/"routing.yaml")
index    = load_yaml(flow_root/"ARKFLOW00-INDEX.yaml")
nom      = load_yaml(core_root/"bricks"/"ARKA_NOMENCLATURE01.yaml")
wakeup   = load_yaml(os_root/"wakeup-intents.matrix.yaml")

intents = [e.get("intent") for e in (manifest.get("workflows_catalog") or []) if e.get("intent")]

# checks
errors = []
# 1) router covers all manifest intents
router_map = {}
for s in (router.get("strategies") or []):
    m = s.get("match",{})
    if m.get("by")=="intent":
        router_map[m.get("value")] = s.get("route",{}).get("flow")

for it in intents:
    if it not in router_map:
        errors.append({"intent": it, "error": "intent absent du router"})
    else:
        fr = router_map[it]
        if not fr or ":" not in fr:
            errors.append({"intent": it, "error": "flow_ref invalide", "flow_ref": fr})
        else:
            bid, exp = fr.split(":",1)
            reg = (index.get("registry") or {}).get(bid)
            if not reg:
                errors.append({"intent": it, "error": f"brique {bid} absente de l'index"})
            elif exp not in (reg.get("exports") or []):
                errors.append({"intent": it, "error": f"export {exp} absent des exports", "exports": reg.get("exports")})

# 2) nomenclature + wakeup coverage
term_ids = [t.get("id") for t in (nom.get("terms") or []) if t.get("id")]
wu_intents = (wakeup.get("intents") or [])
missing_nom = [it for it in intents if it not in term_ids]
missing_wu  = [it for it in intents if it not in wu_intents]
if missing_nom: errors.append({"nomenclature_missing": missing_nom})
if missing_wu:  errors.append({"wakeup_missing": missing_wu})

print(json.dumps({"checked_intents": len(intents), "errors": errors, "ok": len(errors)==0}, ensure_ascii=False, indent=2))
if errors: sys.exit(1)
