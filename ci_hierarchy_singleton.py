
#!/usr/bin/env python3
# ci_hierarchy_singleton.py — vérifie qu'un seul ARKORE01-HIERARCHY existe hors META
import sys, yaml
from pathlib import Path

BASE = Path(sys.argv[1]) if len(sys.argv)>1 else Path(".")
candidates = list((BASE / "ARKA_OS/ARKA_CORE").rglob("*HIERARCHY*.yaml"))
ids = []
for p in candidates:
    try:
        y = yaml.safe_load(p.read_text(encoding="utf-8")) or {}
    except Exception:
        continue
    if isinstance(y, dict) and str(y.get("id","")).startswith("ARKORE01-HIERARCHY"):
        ids.append(str(p))
ok = len(ids) == 1
print({"found": ids, "ok": ok})
if not ok: sys.exit(1)
