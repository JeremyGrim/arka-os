# ARKA_ROUTING — registre & routeur unifié (GPS)

## Objectif
Point d'entrée **unique** pour :
- **lookup** (terme → intent canonique),
- **resolve** (intent → flow_ref + rôles candidats du 1er step + agents par client),
- **catalog** (par facette : term, flow, doc, agent, capability).

> Ce module ne crée rien : il **agrège** MANIFEST/ROUTER/INDEX/NOMENCLATURE/WAKEUP/AGENTS/DOCS
  et expose une **API CLI/HTTP**.

## Installation
Placez le dossier `ARKA_ROUTING/` à la **racine du repo**, à côté de `ARKA_OS/`.

## CLI
```bash
python ARKA_ROUTING/arkarouting.py ping
python ARKA_ROUTING/arkarouting.py catalog --facet flow
python ARKA_ROUTING/arkarouting.py catalog --facet agent --client ACME
python ARKA_ROUTING/arkarouting.py lookup --term "rgpd"
python ARKA_ROUTING/arkarouting.py resolve --term "AUDIT:RGPD" --client ACME
```

## HTTP
```bash
python ARKA_ROUTING/arkarouting.py serve --port 8087
# GET /ping, /catalog?facet=..., /lookup?term=..., /resolve?intent=...&term=...&client=...
```

## Intégration ARKORE (hiérarchie)
Ajouter dans `ARKORE01-HIERARCHY.yaml` (côté CORE) :
```yaml
routing:
  id: ARKA_ROUTING
  index: ARKAROUTING00-INDEX.yaml
  uri_scheme: "arka://<facet>/<id>"
  auto_register: true
```

## CI (discoverability)
```bash
python ARKA_ROUTING/ci/ci_discoverability.py .
```

## Remarques
- Si `nomenclature` est absente, `lookup` se rabat sur les **intents** du `wakeup`.
- Les **rôles** recommandés du 1er step sont calculés à partir des **capabilities** requises
  (CAPAMAP) et du **flow** résolu.
