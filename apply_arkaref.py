
#!/usr/bin/env python3
# apply_arkaref.py — applique le front-matter arkaref selon docs_arkaref_map.yaml
import sys, yaml, re
from pathlib import Path

BASE = Path(sys.argv[1]) if len(sys.argv)>1 else Path(".")
map_p = BASE / "docs_arkaref_map.yaml"
m = yaml.safe_load(map_p.read_text(encoding="utf-8")) or {}
mapping = m.get("map", {})

def inject_frontmatter(md_path: Path, ref: dict):
    txt = md_path.read_text(encoding="utf-8")
    fm_block = "---\n" + yaml.safe_dump({"arkaref": ref}, sort_keys=False, allow_unicode=True) + "---\n"
    if txt.startswith("---"):
        parts = txt.split("---", 2)
        # Replace only the arkaref section (merge)
        try:
            fm = yaml.safe_load(parts[1]) or {}
        except Exception:
            fm = {}
        fm["arkaref"] = ref
        new_txt = "---\n" + yaml.safe_dump(fm, sort_keys=False, allow_unicode=True) + "---" + parts[2]
    else:
        new_txt = fm_block + txt
    md_path.write_text(new_txt, encoding="utf-8")

count = 0
for intent, md_list in mapping.items():
    if not isinstance(md_list, list): 
        continue
    for rel in md_list:
        md_path = BASE / rel
        if not md_path.exists(): 
            continue
        ref = {
            "nomenclature": intent,
            "workflow": None,  # Optional; may be set later by resolver if desired
            "owner": None
        }
        inject_frontmatter(md_path, ref)
        count += 1

print({"updated_docs": count, "ok": True})
