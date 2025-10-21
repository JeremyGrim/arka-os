
#!/usr/bin/env python3
# meta_purge.py — déplace les YAML "actifs" (avec id) depuis ARKA_OS/ARKA_META vers leur module (idempotent)
import sys, json, shutil
from pathlib import Path

BASE = Path(sys.argv[1]) if len(sys.argv)>1 else Path(".")
plan_p = BASE / "meta_moves_plan.json"

plan = json.loads(plan_p.read_text(encoding="utf-8"))
moved = []
skipped = []
for it in plan:
    src = BASE / it["from"]
    dst = BASE / it["to"]
    if not src.exists():
        skipped.append({"from": it["from"], "reason": "absent"})
        continue
    dst.parent.mkdir(parents=True, exist_ok=True)
    # if exists, keep original by renaming new with .new
    if dst.exists():
        dst = dst.with_suffix(dst.suffix + ".new")
    shutil.move(str(src), str(dst))
    moved.append({"from": it["from"], "to": str(dst.relative_to(BASE))})

report = {"moved": moved, "skipped": skipped}
print(json.dumps(report, ensure_ascii=False, indent=2))
