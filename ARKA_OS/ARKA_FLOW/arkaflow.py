# -*- coding: utf-8 -*-
from __future__ import annotations
import os, re, json, time, argparse
from pathlib import Path
from typing import Optional, List, Tuple
import yaml

def _load_yaml(p: Path) -> dict:
    return yaml.safe_load(p.read_text(encoding="utf-8")) or {}

def _ensure_flow_root(flow_dir: Optional[str]) -> Path:
    if flow_dir:
        base = Path(flow_dir).resolve()
    elif os.environ.get("ARKA_FLOW_DIR"):
        base = Path(os.environ["ARKA_FLOW_DIR"]).resolve()
    else:
        base = Path("./ARKA_FLOW").resolve()
    if not base.exists():
        raise SystemExit(f"[ERR] ARKA_FLOW introuvable : {base}")
    return base

def load_manifest(flow_root: Path) -> list:
    man_p = flow_root / "bricks" / "ARKFLOW-00-MANIFEST.yaml"
    if not man_p.exists():
        raise SystemExit(f"[ERR] MANIFEST introuvable : {man_p}")
    return _load_yaml(man_p).get("workflows_catalog", [])

def resolve_flow(intent: Optional[str], tags: List[str], subject: Optional[str], action_key: Optional[str], flow_root: Path) -> Tuple[str, dict]:
    router_p = flow_root / "router" / "routing.yaml"
    router = _load_yaml(router_p)
    strategies = router.get("strategies", [])
    trace = {"matched": None, "candidates": []}
    def _match(rule: dict) -> bool:
        m = rule.get("match", {})
        by = m.get("by")
        if by == "intent" and intent: return m.get("value")==intent
        if by == "thread.tags" and tags:
            return bool(set(m.get("any_of",[])).intersection(set(tags)))
        if by == "subject.pattern" and subject:
            return bool(re.search(m.get("regex"), subject))
        if by == "action_key" and action_key:
            return m.get("value")==action_key
        return False
    for s in strategies:
        if _match(s):
            trace["matched"]=s
            return s["route"]["flow"], trace
        else:
            trace["candidates"].append(s)
    raise SystemExit("[ERR] Aucune règle de routage ne correspond (intent/tags/subject/action_key).")

def resolve_file(flow_ref: str, flow_root: Path) -> Tuple[Path, str]:
    if ":" not in flow_ref: raise SystemExit("[ERR] flow_ref 'ID:EXPORT' attendu")
    brick_id, export = flow_ref.split(":", 1)
    index_p = flow_root / "ARKFLOW00-INDEX.yaml"
    reg = _load_yaml(index_p).get("registry",{})
    if brick_id not in reg: raise SystemExit(f"[ERR] brique {brick_id} absente de l'index")
    file_p = flow_root / reg[brick_id]["file"]
    if not file_p.exists(): raise SystemExit(f"[ERR] fichier de brique introuvable : {file_p}")
    return file_p, export

def load_flow(flow_ref: str, flow_root: Path) -> dict:
    file_p, export = resolve_file(flow_ref, flow_root)
    doc = _load_yaml(file_p)
    flows = doc.get("flows",{})
    if export not in flows: raise SystemExit(f"[ERR] export '{export}' absent dans {file_p.name}")
    return {"id":doc["id"],"export":export,"file":str(file_p),"sequence":flows[export].get("sequence",[]),"common":doc.get("common",{})}

def main():
    ap = argparse.ArgumentParser(prog="arkaflow", description="Résolveur & CLI ARKA_FLOW")
    ap.add_argument("--flow-dir", default=None)
    sp = ap.add_subparsers(dest="cmd")

    sp_cat = sp.add_parser("catalog", help="Lister les workflows (manifest)")
    sp_cat.add_argument("--family", default=None)
    sp_cat.add_argument("--grep", default=None)

    sp_res = sp.add_parser("resolve", help="intent/tags/subject -> flow_ref via router")
    sp_res.add_argument("--intent", required=False)
    sp_res.add_argument("--tags", nargs="*", default=[])
    sp_res.add_argument("--subject", default=None)
    sp_res.add_argument("--action-key", default=None)

    sp_load = sp.add_parser("load", help="Charger un flow export")
    sp_load.add_argument("--flow", required=True)

    args = ap.parse_args()
    root = _ensure_flow_root(args.flow_dir)

    if args.cmd == "catalog":
        items = load_manifest(root)
        if args.family: items = [x for x in items if x.get("family")==args.family]
        if args.grep:
            rg = re.compile(args.grep, re.I)
            items = [x for x in items if rg.search(x.get("intent","")) or rg.search(x.get("title","")) or rg.search(x.get("description",""))]
        print(json.dumps(items, ensure_ascii=False, indent=2))
        return

    if args.cmd == "resolve":
        flow_ref, trace = resolve_flow(args.intent, args.tags, args.subject, args.action_key, root)
        print(json.dumps({"flow_ref":flow_ref, "trace":trace}, ensure_ascii=False, indent=2))
        return

    if args.cmd == "load":
        data = load_flow(args.flow, root)
        print(json.dumps({"flow":data["id"],"export":data["export"],"file":data["file"],"steps":data["sequence"]}, ensure_ascii=False, indent=2))
        return

    ap.print_help()

if __name__ == "__main__":
    main()
