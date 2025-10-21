
#!/usr/bin/env python3
# ci_docs_refcheck.py — vérifie que les front-matters arkaref pointent sur des éléments existants
import sys, yaml, re, json
from pathlib import Path

BASE = Path(sys.argv[1]) if len(sys.argv)>1 else Path(".")
core_nom = BASE / "ARKA_OS/ARKA_CORE/bricks/ARKA_NOMENCLATURE01.yaml"
flow_idx = BASE / "ARKA_OS/ARKA_FLOW/ARKFLOW00-INDEX.yaml"
flow_router = BASE / "ARKA_OS/ARKA_FLOW/router/routing.yaml"

def load_yaml(p): 
    return yaml.safe_load(p.read_text(encoding="utf-8")) or {}

nom = load_yaml(core_nom) if core_nom.exists() else {"terms":[]}
index = load_yaml(flow_idx).get("registry", {}) if flow_idx.exists() else {}
router = load_yaml(flow_router).get("strategies", []) if flow_router.exists() else []

nom_ids = set([t.get("id") for t in nom.get("terms",[]) if t.get("id")])
router_intents = set([s.get("match",{}).get("value") for s in router if s.get("match",{}).get("by")=="intent"])

def read_frontmatter(md_path: Path):
    try:
        txt = md_path.read_text(encoding="utf-8")
    except Exception:
        return None
    if not txt.startswith("---"): return None
    parts = txt.split("---",2)
    if len(parts) < 3: return None
    try:
        fm = yaml.safe_load(parts[1]) or {}
    except Exception:
        fm = {}
    return fm.get("arkaref")

errors = []
checked = 0
for md in (BASE / "ARKA_OS").rglob("*.md"):
    ar = read_frontmatter(md)
    if not ar: 
        continue
    checked += 1
    nom_id = ar.get("nomenclature")
    flow_ref = ar.get("workflow")
    if nom_id and nom_id not in nom_ids:
        if nom_id not in router_intents:
            errors.append({"file": str(md), "error": f"nomenclature '{nom_id}' inconnue (nom & router)"})
    if flow_ref:
        if ":" not in flow_ref:
            errors.append({"file": str(md), "error": f"workflow '{flow_ref}' invalide"})
        else:
            bid, exp = flow_ref.split(":",1)
            meta = index.get(bid)
            if not meta or exp not in (meta.get("exports") or []):
                errors.append({"file": str(md), "error": f"workflow '{flow_ref}' introuvable dans l'index"})

print(json.dumps({"checked_docs": checked, "errors": errors, "ok": len(errors)==0}, ensure_ascii=False, indent=2))
if errors: sys.exit(1)
