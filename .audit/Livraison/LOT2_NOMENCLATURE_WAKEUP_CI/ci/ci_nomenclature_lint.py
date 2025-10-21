
#!/usr/bin/env python3
# ci_nomenclature_lint.py — unicité IDs, owners présents, related_workflows existants
import sys, json, yaml
from pathlib import Path

BASE = Path(sys.argv[1]) if len(sys.argv)>1 else Path(".")
nom_p = BASE / "ARKA_OS/ARKA_CORE/bricks/ARKA_NOMENCLATURE01.yaml"
index_p  = BASE / "ARKA_OS/ARKA_FLOW/ARKFLOW00-INDEX.yaml"

def load_yaml(p):
    return yaml.safe_load(p.read_text(encoding="utf-8")) or {}

nom = load_yaml(nom_p)
index = load_yaml(index_p).get("registry", {})

ids = set()
errors = []
for t in nom.get("terms", []):
    _id = t.get("id")
    if not _id:
        errors.append({"term": t, "error": "id manquant"}); continue
    if _id in ids:
        errors.append({"id": _id, "error": "id en doublon"}); continue
    ids.add(_id)
    if not t.get("owner"):
        errors.append({"id": _id, "error": "owner manquant"})
    for ref in t.get("related_workflows", []):
        if ":" not in ref:
            errors.append({"id": _id, "error": "related_workflow invalide", "ref": ref}); continue
        bid, export = ref.split(":",1)
        meta = index.get(bid)
        if not meta:
            errors.append({"id": _id, "error": f"brique {bid} absente de l'index", "ref": ref}); continue
        if export not in (meta.get("exports") or []):
            errors.append({"id": _id, "error": f"export '{export}' absent des exports indexés", "ref": ref, "exports_index": meta.get("exports")})

print(json.dumps({"checked_terms": len(ids), "errors": errors, "ok": len(errors)==0}, ensure_ascii=False, indent=2))
if errors: sys.exit(1)
