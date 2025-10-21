    #!/usr/bin/env bash
    set -euo pipefail
    here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    repo_root="$(cd "$here/.." && pwd)"
    echo "[assemble] Generating ARKORE00-INDEX.yaml from bricks ..."
    python3 - <<'PY'
import os, re, yaml, sys
from pathlib import Path
root = Path(os.environ.get("REPO_ROOT", Path(__file__).resolve().parents[1]))
bricks = sorted((root/"bricks").glob("*.y*ml"))
def parse(b):
    try:
        y=yaml.safe_load(b.read_text(encoding="utf-8", errors="ignore")) or {}
    except Exception:
        y={}
    _id = y.get("id", b.stem)
    ver = str(y.get("version","1.0.0"))
    exp = y.get("exports") or y.get("provides") or []
    if not isinstance(exp, list): exp=[]
    return _id, {"file": f"bricks/{b.name}", "version": ver, "exports": exp}
reg={}
for b in bricks:
    i, entry = parse(b)
    reg[i]=entry
idx={"id":"ARKORE00-INDEX","version":"1.2.0","registry":reg,
     "contracts":{"invariants":["templates are content-only (no rules)"],"schema":"jsonschema://arka/templates/v1"},
     "change_policy":{"compatibility":"semver"}}
(Path(root)/"ARKORE00-INDEX.yaml").write_text(yaml.safe_dump(idx, sort_keys=False, allow_unicode=True))
print("[assemble] ARKORE00-INDEX.yaml updated")
PY
    echo "[assemble] Done."
