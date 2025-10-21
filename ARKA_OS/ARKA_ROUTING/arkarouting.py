# -*- coding: utf-8 -*-
from __future__ import annotations
import os, re, json, argparse, sys, urllib.parse
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from typing import Optional, Dict, Any, List, Tuple
import yaml

# ---------- helpers ----------
def _load_yaml(p: Path) -> dict:
    try:
        return yaml.safe_load(p.read_text(encoding="utf-8")) or {}
    except Exception:
        return {}

def _cfg(root: Path) -> dict:
    return _load_yaml(root / "bricks" / "ARKAROUTING-03-CONFIG.yaml")

def _paths(root: Path) -> dict:
    return _cfg(root).get("paths", {})

def _join(root: Path, rel: str) -> Path:
    return (root / rel).resolve()

def _frontmatter(md_path: Path) -> dict:
    try:
        txt = md_path.read_text(encoding="utf-8")
    except Exception:
        return {}
    if not txt.startswith("---"):
        return {}
    parts = txt.split("---", 2)
    if len(parts) < 3:
        return {}
    try:
        fm = yaml.safe_load(parts[1]) or {}
    except Exception:
        fm = {}
    return fm

def _flatten_wakeup(w: dict) -> Tuple[List[str], Dict[str,List[str]]]:
    intents = []
    alias_map = {}
    intents_list = w.get("intents")
    aliases = w.get("aliases", {})
    if isinstance(intents_list, list):
        intents = [x for x in intents_list if isinstance(x, str)]
    if isinstance(aliases, dict):
        alias_map = {k:v for k,v in aliases.items() if isinstance(v, list)}
    return intents, alias_map

# ---------- scanners ----------
def scan_manifest(flow_root: Path) -> List[dict]:
    man = flow_root / "bricks" / "ARKFLOW-00-MANIFEST.yaml"
    if man.exists():
        return _load_yaml(man).get("workflows_catalog", [])
    return []

def scan_router(flow_root: Path) -> Dict[str,str]:
    r = flow_root / "router" / "routing.yaml"
    pairs = {}
    if r.exists():
        y = _load_yaml(r)
        for s in y.get("strategies", []):
            m = s.get("match", {})
            if m.get("by") == "intent":
                intent = m.get("value")
                flow = s.get("route",{}).get("flow")
                if intent and flow:
                    pairs[intent] = flow
    return pairs

def scan_index(flow_root: Path) -> dict:
    idx = flow_root / "ARKFLOW00-INDEX.yaml"
    return _load_yaml(idx).get("registry", {}) if idx.exists() else {}

def scan_nomenclature(core_root: Path) -> List[dict]:
    n = core_root / "bricks" / "ARKA_NOMENCLATURE01.yaml"
    y = _load_yaml(n)
    return y.get("terms", []) if isinstance(y, dict) else []

def scan_wakeup(os_root: Path) -> Tuple[List[str], Dict[str,List[str]]]:
    y = _load_yaml(os_root / "wakeup-intents.matrix.yaml")
    return _flatten_wakeup(y if isinstance(y, dict) else {})

def scan_docs(os_root: Path, key: str) -> List[dict]:
    docs = []
    for md in os_root.rglob("*.md"):
        fm = _frontmatter(md)
        if key in fm:
            ref = fm[key] or {}
            if isinstance(ref, dict):
                ref["_path"] = str(md.relative_to(os_root).as_posix())
                docs.append(ref)
    return docs

def scan_agents(agent_root: Path) -> dict:
    data = {"experts":{}, "clients":{}}
    exp = agent_root / "experts"
    if exp.exists():
        for d in exp.iterdir():
            if d.is_dir():
                data["experts"][d.name] = {"expert": f"experts/{d.name}/expert.yaml", "wakeup": f"experts/{d.name}/wakeup.yaml"}
    cl = agent_root / "clients"
    if cl.exists():
        for c in cl.iterdir():
            if c.is_dir():
                idx = {}
                for ob in c.rglob("onboarding.yaml"):
                    aid = ob.parent.name
                    idx[aid] = str(ob.relative_to(agent_root).as_posix())
                data["clients"][c.name] = idx
    return data

def scan_capamap(flow_root: Path) -> dict:
    c = flow_root / "bricks" / "ARKFLOW-CAPAMAP01-CAPABILITY-MATRIX.yaml"
    return _load_yaml(c) or {}

def scan_flows(flow_root: Path, registry: dict) -> dict:
    flows = {}
    for bid, meta in (registry or {}).items():
        file_rel = meta.get("file")
        if not file_rel:
            continue
        p = flow_root / file_rel
        y = _load_yaml(p)
        if isinstance(y, dict) and "flows" in y:
            flows[(bid)] = y["flows"]
    return flows

# ---------- core logic ----------
def _term_catalog(core_root: Path, os_root: Path) -> List[dict]:
    terms = scan_nomenclature(core_root)
    if terms:
        return terms
    # fallback to wakeup intents only
    intents, aliases = scan_wakeup(os_root)
    return [{"id": it, "aliases": aliases.get(it, [])} for it in intents]

def _intent_from_term(term: str, core_root: Path, os_root: Path) -> Optional[str]:
    # exact id in nomenclature
    for t in _term_catalog(core_root, os_root):
        if t.get("id") == term:
            return term
    # alias/label/tag match
    term_l = (term or "").lower()
    best = None; score_best = 0
    for t in _term_catalog(core_root, os_root):
        sc = 0
        for f in ("label","id"):
            v = (t.get(f) or "").lower()
            if v == term_l: sc += 4
            elif term_l in v: sc += 2
        for lst in ("aliases","tags"):
            for v in (t.get(lst) or []):
                v = (v or "").lower()
                if v == term_l: sc += 3
                elif term_l in v: sc += 1
        if sc>score_best:
            score_best, best = sc, t.get("id")
    return best

def _resolve_intent(intent: str, flow_root: Path) -> Optional[str]:
    router = scan_router(flow_root)
    if intent in router:
        return router[intent]
    # fallback manifest
    for e in scan_manifest(flow_root):
        if e.get("intent") == intent:
            return e.get("flow_ref")
    return None

def _first_step_roles(flow_root: Path, registry: dict, flow_ref: str, capamap: dict) -> List[str]:
    # derive first step required caps then roles
    if not flow_ref or ":" not in flow_ref:
        return []
    bid, export = flow_ref.split(":",1)
    meta = registry.get(bid)
    if not meta:
        return []
    path = flow_root / meta.get("file","")
    y = _load_yaml(path)
    obj = (y.get("flows", {}) or {}).get(export, {})
    seq = obj.get("sequence", [])
    if not seq:
        return []
    # look at the first actionable step (skip notify only)
    first = None
    for st in seq:
        if isinstance(st, dict):
            first = st; break
    req_caps = set()
    for key in ("requires_caps","requires_caps_any"):
        for c in (first or {}).get(key, []) or []:
            req_caps.add(c)
    roles = set()
    for c in req_caps:
        for r in (capamap.get("capabilities", {}).get(c) or []):
            roles.add(r)
    return sorted(list(roles))

def _agents_for_roles(agent_root: Path, client: Optional[str], roles: List[str]) -> List[dict]:
    agents = scan_agents(agent_root)
    out = []
    if client and client in (agents.get("clients") or {}):
        amap = agents["clients"][client]
        for role in roles:
            rid = re.sub(r'[^a-z0-9]+','-', role.lower()).strip('-')
            for aid, ref in amap.items():
                if aid == rid:
                    out.append({"client": client, "role": role, "onboarding": ref})
    return out

# ---------- public API ----------
def catalog(root: Path, facet: Optional[str], grep: Optional[str], client: Optional[str]) -> dict:
    cfg = _cfg(root); paths = _paths(root)
    os_root = _join(root, paths["os_root"])
    core = _join(root, paths["core"])
    flow = _join(root, paths["flow"])
    agents = _join(root, paths["agents"])
    # Build
    manifest = scan_manifest(flow)
    idx = scan_index(flow)
    terms = _term_catalog(core, os_root)
    cap = scan_capamap(flow)
    docs = scan_docs(os_root, cfg["options"]["doc_frontmatter_key"])
    ag_idx = scan_agents(agents)
    items = []
    # term
    for t in terms:
        items.append({"facet":"term","id":t.get("id"),"label":t.get("label"),"aliases":t.get("aliases",[]),"tags":t.get("tags",[]),"owner":t.get("owner")})
    # flow
    for e in manifest:
        items.append({"facet":"flow","intent":e.get("intent"),"flow_ref":e.get("flow_ref"),"family":e.get("family"),"title":e.get("title")})
    # doc
    for d in docs:
        items.append({"facet":"doc", **d})
    # agent
    for role, refs in (ag_idx.get("experts") or {}).items():
        items.append({"facet":"agent","kind":"expert","role": role, "expert": refs["expert"], "wakeup": refs["wakeup"]})
    for cl, amap in (ag_idx.get("clients") or {}).items():
        for aid, ref in amap.items():
            items.append({"facet":"agent","kind":"client","client":cl,"agent_id":aid,"onboarding":ref})
    # capability
    for capid, roles in (cap.get("capabilities") or {}).items():
        items.append({"facet":"capability","id":capid,"roles":roles})
    # filters
    if facet:
        items = [x for x in items if x.get("facet")==facet]
    if client and facet=="agent":
        items = [x for x in items if x.get("client")==client or x.get("kind")=="expert"]
    if grep:
        rg = re.compile(re.escape(grep), re.I)
        def hit(x):
            for k in ("id","label","aliases","tags","intent","title","client","agent_id","role"):
                v = x.get(k)
                if isinstance(v, str) and rg.search(v): return True
                if isinstance(v, list) and any(rg.search(s) for s in v if isinstance(s,str)): return True
            return False
        items = [x for x in items if hit(x)]
    return {"items": items, "counts": {"total": len(items)}}

def lookup(root: Path, term: str) -> dict:
    cfg = _cfg(root); paths = _paths(root)
    os_root = _join(root, paths["os_root"])
    core = _join(root, paths["core"])
    intent = _intent_from_term(term, core, os_root)
    return {"term": term, "intent": intent}

def resolve(root: Path, intent: Optional[str], term: Optional[str], client: Optional[str]) -> dict:
    cfg = _cfg(root); paths = _paths(root)
    os_root = _join(root, paths["os_root"])
    core = _join(root, paths["core"])
    flow = _join(root, paths["flow"])
    agents = _join(root, paths["agents"])
    if not intent and term:
        intent = _intent_from_term(term, core, os_root)
    flow_ref = _resolve_intent(intent, flow) if intent else None
    idx = scan_index(flow)
    cap = scan_capamap(flow)
    roles = _first_step_roles(flow, idx, flow_ref, cap) if flow_ref else []
    onboard = _agents_for_roles(agents, client, roles) if client and roles else []
    return {"intent": intent, "flow_ref": flow_ref, "recommended_roles": roles, "candidate_agents": onboard}

# ---------- HTTP ----------
class Handler(BaseHTTPRequestHandler):
    def _send(self, code, obj):
        data = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type","application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        root = Path(os.environ.get("ARKA_ROUTING_DIR") or "./ARKA_ROUTING").resolve()
        p = urllib.parse.urlparse(self.path)
        q = urllib.parse.parse_qs(p.query)
        try:
            if p.path=="/ping":
                return self._send(200, {"ok": True, "root": str(root)})
            if p.path=="/catalog":
                facet = q.get("facet",[None])[0]
                grep = q.get("grep",[None])[0]
                client = q.get("client",[None])[0]
                return self._send(200, catalog(root, facet, grep, client))
            if p.path=="/lookup":
                term = q.get("term",[None])[0]
                return self._send(200, lookup(root, term))
            if p.path=="/resolve":
                intent = q.get("intent",[None])[0]
                term = q.get("term",[None])[0]
                client = q.get("client",[None])[0]
                return self._send(200, resolve(root, intent, term, client))
            return self._send(404, {"error":"not_found"})
        except Exception as e:
            return self._send(500, {"error": str(e)})

def main():
    ap = argparse.ArgumentParser(prog="arkarouting", description="ARKA_ROUTING — registre/routeur (lookup/catalog/resolve)")
    ap.add_argument("--routing-dir", default=None, help="Racine du module ARKA_ROUTING (défaut: ./ARKA_ROUTING)")
    sp = ap.add_subparsers(dest="cmd")
    sp.add_parser("ping")
    p_cat = sp.add_parser("catalog"); p_cat.add_argument("--facet"); p_cat.add_argument("--grep"); p_cat.add_argument("--client")
    p_lk = sp.add_parser("lookup"); p_lk.add_argument("--term", required=True)
    p_rs = sp.add_parser("resolve"); p_rs.add_argument("--intent"); p_rs.add_argument("--term"); p_rs.add_argument("--client")
    p_srv= sp.add_parser("serve"); p_srv.add_argument("--port", type=int, default=8087)
    args = ap.parse_args()
    root = Path(args.routing_dir or "./ARKA_ROUTING").resolve()
    if args.cmd=="ping":
        print(json.dumps({"ok": True, "root": str(root)}, ensure_ascii=False)); return
    if args.cmd=="catalog":
        print(json.dumps(catalog(root, args.facet, args.grep, args.client), ensure_ascii=False, indent=2)); return
    if args.cmd=="lookup":
        print(json.dumps(lookup(root, args.term), ensure_ascii=False, indent=2)); return
    if args.cmd=="resolve":
        print(json.dumps(resolve(root, args.intent, args.term, args.client), ensure_ascii=False, indent=2)); return
    if args.cmd=="serve":
        os.environ["ARKA_ROUTING_DIR"] = str(root)
        HTTPServer(("0.0.0.0", args.port), Handler).serve_forever(); return
    ap.print_help()

if __name__ == "__main__":
    main()
