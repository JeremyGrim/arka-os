
#!/usr/bin/env python3
# ci_meta_scan.py — échoue si ARKA_OS/ARKA_META contient un YAML avec 'id'
import sys, yaml
from pathlib import Path

BASE = Path(sys.argv[1]) if len(sys.argv)>1 else Path(".")
meta = BASE / "ARKA_OS/ARKA_META"
bad = []
if meta.exists():
    for p in meta.rglob("*.yml"):
        y = yaml.safe_load(p.read_text(encoding="utf-8")) or {}
        if isinstance(y, dict) and "id" in y:
            bad.append(str(p))
    for p in meta.rglob("*.yaml"):
        y = yaml.safe_load(p.read_text(encoding="utf-8")) or {}
        if isinstance(y, dict) and "id" in y:
            bad.append(str(p))
print({"bad": bad, "ok": len(bad)==0})
if bad: sys.exit(1)
