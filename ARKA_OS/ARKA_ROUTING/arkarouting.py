# -*- coding: utf-8 -*-
from __future__ import annotations
import os, re, json, argparse, sys
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from typing import Optional, Dict, Any, List, Tuple
import yaml

def _load_yaml(p: Path) -> dict:
    try:
        return yaml.safe_load(p.read_text(encoding="utf-8")) or {}
    except Exception:
        return {}

def _cfg(root: Path) -> dict:
    # Load config if present; never fail
    p = root / "bricks" / "ARKAROUTING-03-CONFIG.yaml"
    return _load_yaml(p) if p.exists() else {}

def _autodetect_os_root(root: Path) -> Optional[Path]:
    # Try to locate ARKA_OS (look for FLOW index)
    candidates = []
    # 1) sibling "ARKA_OS" from script's parent (if script is .../ARKA_ROUTING)
    candidates.append(root.parent / "ARKA_OS")
    # 2) parent (module nested under ARKA_OS)
    candidates.append(root.parent)
    # 3) CWD/ARKA_OS and CWD (for manual invocations)
    cwd = Path.cwd()
    candidates.append(cwd / "ARKA_OS")
    candidates.append(cwd)

    for base in candidates:
        if (base / "ARKA_FLOW" / "ARKFLOW00-INDEX.yaml").exists():
            return base.resolve()
    return None

def _paths(root: Path) -> dict:
    cfg = _cfg(root)
    paths = dict(cfg.get("paths") or {})
    # Autodetect if missing or invalid
    need_guess = ("os_root" not in paths)
    if not need_guess:
        # validate
        try:
            if not ( (root / paths["os_root"]).resolve() / "ARKA_FLOW" / "ARKFLOW00-INDEX.yaml").exists():
                need_guess = True
        except Exception:
            need_guess = True
    if need_guess:
        guessed = _autodetect_os_root(root)
        if not guessed:
            raise RuntimeError("Impossible de localiser ARKA_OS. Indiquez --routing-dir ou complétez bricks/ARKAROUTING-03-CONFIG.yaml")
        paths["os_root"] = str(guessed)
        paths["core"] = str(guessed / "ARKA_CORE")
        paths["flow"] = str(guessed / "ARKA_FLOW")
        paths["agents"] = str(guessed / "ARKA_AGENT")
    return paths

def _frontmatter(md_path: Path) -> dict:
    try:
        txt = md_path.read_text(encoding="utf-8")
    except Exception:
        return {}
    if not txt.startswith("---"): return {}
    parts = txt.split("---",2)
    if len(parts)<3: return {}
    try:
        fm = yaml.safe_load(parts[1]) or {}
    except Exception:
        fm = {}
    return fm

# scanners (unchanged)
def scan_manifest(flow_root: Path) -> List[dict]:
    p = flow_root / "bricks" / "ARKFLOW-00-MANIFEST.yaml"
    y = _load_yaml(p)
    return y.get("workflows_catalog", []) if isinstance(y, dict) else []

def scan_router(flow_root: Path) -> Dict[str,str]:
    r = flow_root / "router" / "routing.yaml"
    y = _load_yaml(r)
    pairs = {}
    for s in y.get("strategies", []):
        m = s.get("match", {})
        if m.get("by")=="intent":
            pairs[m.get("value")] = s.get("route",{}).get("flow")
    return pairs

def scan_index(flow_root: Path) -> dict:
    idx = flow_root / "ARKFLOW00-INDEX.yaml"
    return _load_yaml(idx).get("registry", {})

def scan_nomenclature(core_root: Path) -> List[dict]:
    n = core_root / "bricks" / "ARKA_NOMENCLATURE01.yaml"
    y = _load_yaml(n)
    return y.get("terms", []) if isinstance(y, dict) else []

def scan_wakeup(os_root: Path) -> Tuple[List[str], Dict[str,List[str]]]:
    y = _load_yaml(os_root / "wakeup-intents.matrix.yaml")
    intents = y.get("intents", []) if isinstance(y, dict) else []
    aliases = y.get("aliases", {}) if isinstance(y, dict) else {}
    return intents, aliases

def scan_docs(os_root: Path, key: str) -> List[dict]:
    docs = []
    for md in os_root.rglob("*.md"):
        fm = _frontmatter(md)
        if key in fm and isinstance(fm[key], dict):
            ref = dict(fm[key])
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
        p = flow_root / meta.get("file","MISSING")
        y = _load_yaml(p)
        if isinstance(y, dict) and "flows" in y:
            flows[(bid)] = y["flows"]
    return flows

def _term_catalog(core_root: Path, os_root: Path) -> List[dict]:
    terms = scan_nomenclature(core_root)
    if terms: return terms
    intents, aliases = scan_wakeup(os_root)
    return [{"id": it, "aliases": aliases.get(it, [])} for it in intents]

def _intent_from_term(term: str, core_root: Path, os_root: Path) -> Optional[str]:
    term_l = (term or "").lower()
    for t in _term_catalog(core_root, os_root):
        if t.get("id")==term: return term
    best = None; score_best=0
    for t in _term_catalog(core_root, os_root):
        sc=0
        for f in ("label","id"):
            v=(t.get(f) or "").lower()
            if v==term_l: sc+=4
            elif term_l in v: sc+=2
        for f in ("aliases","tags"):
            for v in (t.get(f) or []):
                v=(v or "").lower()
                if v==term_l: sc+=3
                elif term_l in v: sc+=1
        if sc>score_best: score_best, best = sc, t.get("id")
    return best

def _resolve_intent(intent: str, flow_root: Path) -> Optional[str]:
    r = scan_router(flow_root)
    if intent in r: return r[intent]
    for e in scan_manifest(flow_root):
        if e.get("intent")==intent:
            return e.get("flow_ref")
    return None

def _first_step_roles(flow_root: Path, registry: dict, flow_ref: str, capamap: dict) -> List[str]:
    if not flow_ref or ":" not in flow_ref: return []
    bid, export = flow_ref.split(":",1)
    meta = registry.get(bid)
    if not meta: return []
    y = _load_yaml(flow_root / meta.get("file","MISSING"))
    obj = (y.get("flows", {}) or {}).get(export, {})
    seq = obj.get("sequence", [])
    first = None
    for st in seq:
        if isinstance(st, dict): first = st; break
    if not first: return []
    req_caps=set()
    for k in ("requires_caps","requires_caps_any"):
        for c in (first.get(k) or []): req_caps.add(c)
    roles=set()
    for c in req_caps:
        for r in (capamap.get("capabilities", {}).get(c) or []):
            roles.add(r)
    return sorted(list(roles))

def _agents_for_roles(agent_root: Path, client: Optional[str], roles: List[str]) -> List[dict]:
    out=[]
    exp = scan_agents(agent_root)
    amap = (exp.get("clients") or {}).get(client, {}) if client else {}
    for role in roles:
        rid = re.sub(r'[^a-z0-9]+','-', role.lower()).strip('-')
        for aid, ref in (amap or {}).items():
            if aid==rid:
                out.append({"client": client, "role": role, "onboarding": ref})
    return out

# API
def catalog(root: Path, facet: Optional[str], grep: Optional[str], client: Optional[str]) -> dict:
    paths = _paths(root)
    os_root = Path(paths["os_root"])
    core = Path(paths.get("core") or os_root/"ARKA_CORE")
    flow = Path(paths.get("flow") or os_root/"ARKA_FLOW")
    agents = Path(paths.get("agents") or os_root/"ARKA_AGENT")
    manifest = scan_manifest(flow)
    idx = scan_index(flow)
    terms = _term_catalog(core, os_root)
    cap = scan_capamap(flow)
    docs = scan_docs(os_root, _cfg(root).get("options",{}).get("doc_frontmatter_key","arkaref"))
    ag_idx = scan_agents(agents)

    items=[]
    for t in terms: items.append({"facet":"term","id":t.get("id"),"label":t.get("label"),"aliases":t.get("aliases",[]),"tags":t.get("tags",[]),"owner":t.get("owner")})
    for e in manifest: items.append({"facet":"flow","intent":e.get("intent"),"flow_ref":e.get("flow_ref"),"family":e.get("family"),"title":e.get("title")})
    for d in docs: items.append({"facet":"doc", **d})
    for role, refs in (ag_idx.get("experts") or {}).items(): items.append({"facet":"agent","kind":"expert","role":role, **refs})
    for cl, amap in (ag_idx.get("clients") or {}).items():
        for aid, ref in amap.items(): items.append({"facet":"agent","kind":"client","client":cl,"agent_id":aid,"onboarding":ref})
    for capid, roles in (cap.get("capabilities") or {}).items(): items.append({"facet":"capability","id":capid,"roles":roles})
    if facet: items=[x for x in items if x.get("facet")==facet]
    if client and facet=="agent": items=[x for x in items if x.get("client")==client or x.get("kind")=="expert"]
    if grep:
        rg=re.compile(re.escape(grep), re.I)
        def hit(x):
            for k in ("id","label","aliases","tags","intent","title","client","agent_id","role"):
                v=x.get(k)
                if isinstance(v, str) and rg.search(v): return True
                if isinstance(v, list) and any(rg.search(s) for s in v if isinstance(s,str)): return True
            return False
        items=[x for x in items if hit(x)]
    return {"items": items, "counts": {"total": len(items)}}

def lookup(root: Path, term: str) -> dict:
    paths = _paths(root)
    os_root = Path(paths["os_root"])
    core = Path(paths.get("core") or os_root/"ARKA_CORE")
    intent = _intent_from_term(term, core, os_root)
    return {"term": term, "intent": intent}

def resolve(root: Path, intent: Optional[str], term: Optional[str], client: Optional[str]) -> dict:
    paths = _paths(root)
    os_root = Path(paths["os_root"])
    core = Path(paths.get("core") or os_root/"ARKA_CORE")
    flow = Path(paths.get("flow") or os_root/"ARKA_FLOW")
    agents = Path(paths.get("agents") or os_root/"ARKA_AGENT")
    if not intent and term:
        intent = _intent_from_term(term, core, os_root)
    flow_ref = _resolve_intent(intent, flow) if intent else None
    idx = scan_index(flow)
    cap = scan_capamap(flow)
    roles = _first_step_roles(flow, idx, flow_ref, cap) if flow_ref else []
    onboard = _agents_for_roles(agents, client, roles) if client and roles else []
    return {"intent": intent, "flow_ref": flow_ref, "recommended_roles": roles, "candidate_agents": onboard}

# HTTP server
class Handler(BaseHTTPRequestHandler):
    def _send(self, code, obj):
        data = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type","application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)
    def do_GET(self):
        root = Path(os.environ.get("ARKA_ROUTING_DIR") or Path(__file__).parent).resolve()
        p = self.path.split("?",1)
        path = p[0]; qs = (p[1] if len(p)>1 else "")
        import urllib.parse as up
        q = up.parse_qs(qs)
        try:
            if path=="/ping": return self._send(200, {"ok": True, "root": str(root)})
            if path=="/catalog": return self._send(200, catalog(root, q.get("facet",[None])[0], q.get("grep",[None])[0], q.get("client",[None])[0]))
            if path=="/lookup":  return self._send(200, lookup(root, q.get("term",[None])[0]))
            if path=="/resolve": return self._send(200, resolve(root, q.get("intent",[None])[0], q.get("term",[None])[0], q.get("client",[None])[0]))
            return self._send(404, {"error":"not_found"})
        except Exception as e:
            return self._send(500, {"error": str(e)})

def main():
    ap = argparse.ArgumentParser(prog="arkarouting", description="ARKA_ROUTING — registre/routeur (lookup/catalog/resolve)")
    ap.add_argument("--routing-dir", default=None, help="Racine du module ARKA_ROUTING (défaut: *dossier du script*)")
    sp = ap.add_subparsers(dest="cmd")
    sp.add_parser("ping")
    p_cat = sp.add_parser("catalog"); p_cat.add_argument("--facet"); p_cat.add_argument("--grep"); p_cat.add_argument("--client")
    p_lk = sp.add_parser("lookup"); p_lk.add_argument("--term", required=True)
    p_rs = sp.add_parser("resolve"); p_rs.add_argument("--intent"); p_rs.add_argument("--term"); p_rs.add_argument("--client")
    p_srv= sp.add_parser("serve"); p_srv.add_argument("--port", type=int, default=8087)
    args = ap.parse_args()
    root = Path(args.routing_dir or Path(__file__).parent).resolve()
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
