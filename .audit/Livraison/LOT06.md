**ARKA_ROUTING** (le GPS/registre d’ARKA‑LABS)

---

## 🎁 Livrable

**Télécharger :** **[ARKA_ROUTING.zip](sandbox:/mnt/data/ARKA_ROUTING.zip)**

**Contenu (arborescence)**

```
ARKA_ROUTING/
  ARKAROUTING00-INDEX.yaml
  bricks/
    ARKAROUTING-01-FACETS.yaml       # facettes couvertes (term, flow, doc, agent, capability, policy, dataset, service)
    ARKAROUTING-02-RESOLVERS.yaml    # schéma d’URI & sources → stratégies
    ARKAROUTING-03-CONFIG.yaml       # chemins ARKA_OS & options
  arkarouting.py                     # CLI + mini HTTP server (lookup / catalog / resolve)
  ci/
    ci_discoverability.py            # CI: vérifie MANIFEST↔ROUTER↔INDEX↔NOMENCLATURE↔WAKEUP (couverture intents)
  README-ARKA_ROUTING.md
```

> **Nom pro** retenu : **ARKA_ROUTING** (URI : `arka://<facet>/<id>`).
> Il **agrège l’existant** (MANIFEST, ROUTER, INDEX, NOMENCLATURE, WAKEUP, AGENTS, DOCS) et expose une **API CLI/HTTP**.
> Il s’aligne sur la refonte Agents **experts centralisés + onboarding client unifié** telle qu’entérinée. 

---

## ⚙️ Ce que fait ARKA_ROUTING (concret)

### 1) **lookup** — terme → intent canonique

* Lit `ARKA_OS/ARKA_CORE/bricks/ARKA_NOMENCLATURE01.yaml` (sinon fallback sur `wakeup-intents.matrix.yaml`).
* Résout un **terme/alias/tag** vers l’**intent** (ex. `rgpd` → `AUDIT:RGPD`).

```bash
python ARKA_ROUTING/arkarouting.py lookup --term "rgpd"
```

### 2) **resolve** — intent/terme → flow_ref (+ acteurs candidats)

* Lit `ARKA_OS/ARKA_FLOW/router/routing.yaml` (fallback MANIFEST si besoin) pour `intent → flow_ref`.
* Calcule les **rôles recommandés** pour le **1er step** du flow via **CAPAMAP** (`requires_caps(_any)` dans le flow).
* Si `--client <ID>` est fourni, propose les **agents candidats** (onboarding) correspondant aux rôles.

```bash
python ARKA_ROUTING/arkarouting.py resolve --term "AUDIT:RGPD" --client ACME
```

**Sortie** :

```json
{
  "intent": "AUDIT:RGPD",
  "flow_ref": "ARKFLOW-04A-WORKFLOWS-AUDIT:AUDIT_RGPD_CHAIN",
  "recommended_roles": ["SecurityComplianceArchitect", "Archiviste"],
  "candidate_agents": [{"client": "ACME", "role": "Archiviste", "onboarding": "clients/ACME/agents/archiviste/onboarding.yaml"}]
}
```

### 3) **catalog** — découverte unifiée (multi‑facettes)

* **term** : nomenclature (id, label, aliases, tags, owner)
* **flow** : intents + `flow_ref` (depuis MANIFEST)
* **doc** : docs avec front‑matter `arkaref` (Lot 4)
* **agent** : experts centralisés + agents clients (Lot 5)
* **capability** : CAPAMAP (cap → roles)

```bash
python ARKA_ROUTING/arkarouting.py catalog --facet flow
python ARKA_ROUTING/arkarouting.py catalog --facet agent --client ACME
python ARKA_ROUTING/arkarouting.py catalog --grep "rgpd"
```

---

## 🔌 Intégration ARKORE (point d’entrée unique)

Ajoute ceci dans `ARKORE01-HIERARCHY.yaml` (côté CORE) :

```yaml
routing:
  id: ARKA_ROUTING
  index: ARKAROUTING00-INDEX.yaml
  uri_scheme: "arka://<facet>/<id>"
  auto_register: true
```

> Ainsi, **tous** les daemons/agents savent **où** interroger le “GPS”.

---

## 🌐 Mode HTTP (si tu veux exposer un endpoint interne)

```bash
python ARKA_ROUTING/arkarouting.py serve --port 8087
# Endpoints:
#   GET /ping
#   GET /catalog?facet=&grep=&client=
#   GET /lookup?term=
#   GET /resolve?intent=&term=&client=
```

---

## ✅ CI de découvrabilité

Exécuter depuis la racine du repo :

```bash
python ARKA_ROUTING/ci/ci_discoverability.py .
```

* Vérifie que **tous** les **intents** du **MANIFEST** sont couverts par le **ROUTER**, que les `flow_ref` pointent des exports valides dans l’**INDEX**, et que **NOMENCLATURE** + **WAKEUP** contiennent ces intents.

---

## 🔒 Sécurité & Robustesse

* **Aucune transformation** des sources productives : ARKA_ROUTING est *read-only* sur le repo.
* **Dégradations contrôlées** : si une source manque (ex. nomenclature), fallback sur wake‑up/manifest.
* **Rôles candidats** calculés **réellement** via **CAPAMAP + flows** (pas d’heuristique floue).

---

## 📘 Rappel du cadre Agents

Le module utilise l’index Agents **normalisé** et la séparation **experts/** vs **clients/<ID>/agents/** posées dans la refonte multiprojet. 

---


