
#!/usr/bin/env python3
# ci_resolve_all.py — Vérifie intent→flow_ref→export pour le router FLOW
import sys, json, yaml
from pathlib import Path

BASE = Path(sys.argv[1]) if len(sys.argv)>1 else Path(".")
router_p = BASE / "ARKA_OS/ARKA_FLOW/router/routing.yaml"
index_p  = BASE / "ARKA_OS/ARKA_FLOW/ARKFLOW00-INDEX.yaml"

def load_yaml(p):
    return yaml.safe_load(p.read_text(encoding="utf-8")) or {}

router = load_yaml(router_p)
index = load_yaml(index_p).get("registry", {})

errors = []
checked = 0
for s in router.get("strategies", []):
    m = s.get("match",{})
    if m.get("by")!="intent" or m.get("value")=="DISCOVER:WORKFLOWS":
        continue
    checked += 1
    flow_ref = s.get("route",{}).get("flow")
    if not flow_ref or ":" not in flow_ref:
        errors.append({"intent": m.get("value"), "error": "flow_ref manquant ou invalide", "flow_ref": flow_ref})
        continue
    bid, export = flow_ref.split(":",1)
    meta = index.get(bid)
    if not meta:
        errors.append({"intent": m.get("value"), "error": f"brique {bid} absente de l'index", "flow_ref": flow_ref})
        continue
    exports = meta.get("exports",[])
    if export not in exports:
        errors.append({"intent": m.get("value"), "error": f"export '{export}' absent des exports indexés", "flow_ref": flow_ref, "exports_index": exports})

result = {"checked_intents": checked, "errors": errors, "ok": len(errors)==0}
print(json.dumps(result, ensure_ascii=False, indent=2))
if errors: sys.exit(1)
