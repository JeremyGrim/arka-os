
#!/usr/bin/env python3
# hierarchy_merge.py — applique un patch 'merge.flow/registry' sur ARKORE01-HIERARCHY.yaml (idempotent)
import sys, yaml
from pathlib import Path

BASE = Path(sys.argv[1]) if len(sys.argv)>1 else Path(".")
patch_p = BASE / "ARKA_OS.ARKA_CORE.bricks.ARKORE01-HIERARCHY.patch.yaml"

def load_yaml(p): 
    return yaml.safe_load(p.read_text(encoding="utf-8")) or {}

# Locate a single ARKORE01-HIERARCHY.yaml under ARKA_OS/ARKA_CORE
candidates = list((BASE / "ARKA_OS/ARKA_CORE").rglob("*HIERARCHY*.yaml"))
target = None
for p in candidates:
    y = load_yaml(p)
    if isinstance(y, dict) and str(y.get("id","")).startswith("ARKORE01-HIERARCHY"):
        target = p; break

if not target:
    print("[ERR] Fichier ARKORE01-HIERARCHY introuvable sous ARKA_OS/ARKA_CORE")
    sys.exit(1)

hier = load_yaml(target)
patch = load_yaml(patch_p).get("merge", {})

# Ensure nodes
for node, content in patch.items():
    if node not in hier:
        hier[node] = content
    else:
        # merge shallowly
        for k,v in content.items():
            hier[node][k] = v

# Write back (with backup)
bak = target.with_suffix(target.suffix + ".bak")
if not bak.exists():
    bak.write_text((target.read_text(encoding="utf-8")), encoding="utf-8")
target.write_text(yaml.safe_dump(hier, sort_keys=False, allow_unicode=True), encoding="utf-8")
print(f"[OK] Patch appliqué à {target}")
