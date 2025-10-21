
#!/usr/bin/env python3
# ci_wakeup_diff.py — wakeup intents doivent couvrir la nomenclature
import sys, json, yaml
from pathlib import Path

BASE = Path(sys.argv[1]) if len(sys.argv)>1 else Path(".")
nom_p = BASE / "ARKA_OS/ARKA_CORE/bricks/ARKA_NOMENCLATURE01.yaml"
wakeup_p = BASE / "ARKA_OS/wakeup-intents.matrix.yaml"

def load_yaml(p):
    return yaml.safe_load(p.read_text(encoding="utf-8")) or {}

nom = load_yaml(nom_p)
wup = load_yaml(wakeup_p)

terms = sorted([t.get("id") for t in nom.get("terms", []) if t.get("id")])
wu_list = sorted(wup.get("intents", []))

missing_in_wakeup = [t for t in terms if t not in wu_list]
extra_in_wakeup = [w for w in wu_list if w not in terms]
res = {"terms": len(terms), "wakeup": len(wu_list), "missing_in_wakeup": missing_in_wakeup, "extra_in_wakeup": extra_in_wakeup, "ok": len(missing_in_wakeup)==0}
print(json.dumps(res, ensure_ascii=False, indent=2))
if missing_in_wakeup: sys.exit(1)
