
---

## 📦 Livrables d’audit (faits à partir de `ARKA_LABS.zip`)

* **Résumé JSON** (volumétrie, fichiers clés, manquants, etc.)
  → [summary.json](sandbox:/mnt/data/ARKA_AUDIT_ARTIFACTS/summary.json)
* **Vue d’ensemble par répertoire top‑level**
  → [top_overview.csv](sandbox:/mnt/data/ARKA_AUDIT_ARTIFACTS/top_overview.csv)
* **Tous les YAML porteurs d’un `id` (briques)**
  → [yaml_with_ids.csv](sandbox:/mnt/data/ARKA_AUDIT_ARTIFACTS/yaml_with_ids.csv)
* **Comparatif `MANIFEST` vs `wakeup‑intents.matrix.yaml`** (écarts d’intents)
  → [manifest_wakeup_compare.json](sandbox:/mnt/data/ARKA_AUDIT_ARTIFACTS/manifest_wakeup_compare.json)
* **Détails clés (routes, indexes, agents, META, etc.)**
  → [audit_details.json](sandbox:/mnt/data/ARKA_AUDIT_ARTIFACTS/audit_details.json)
* **Snapshot unifié (catalogue `intent → flow_ref` + index)**
  → [registry_snapshot.json](sandbox:/mnt/data/ARKA_AUDIT_ARTIFACTS/registry_snapshot.json)

*(Ces fichiers sont prêts à être posés dans un dossier `build/audit/` du repo si tu veux historiser.)*

---

## 🗺️ Cartographie rapide (faits saillants)

* **Volumétrie** : 656 fichiers.
  Plus grosses zones : `ARKA_META` (226 fichiers), `ARKA_OS` (199), ensuite providers/dotfiles.
* **ARKA_FLOW** dans `ARKA_OS/ARKA_FLOW/` :

  * **Index** présent (`ARKFLOW00-INDEX.yaml`). ✔︎
  * **Manifest** présent (`bricks/ARKFLOW-00-MANIFEST.yaml`). ✔︎
  * **Router** **absent** (`router/routing.yaml` introuvable). ✖︎ → **pas de résolution intent → workflow** automatique.
* **Nomenclature / intents** :

  * `wakeup-intents.matrix.yaml` est présent (racine `ARKA_OS`). ✔︎
  * **Zéro intent** exploitable détecté dans ce fichier (aucune clé de forme `PREFIX:SUJET`). ✖︎
  * Le **MANIFEST FLOW expose 16 intents** (`AUDIT:*`, `DELIVERY:*`, `DOC:*`, `OPS:*`, `MKT:*`, `PEOPLE:*`).
    → **16 intents du manifest n’existent pas** dans la matrice wake‑up actuelle.
* **Agents** (`ARKA_OS/ARKA_AGENT/`) :

  * **Clients** : 74 chemins détectés (réplication par client).
  * **Experts** : 29 chemins.
  * **onboarding.yaml** : **aucun** trouvé (le format unifié n’est pas en place).
  * Constate exactement la dérive que tu as pointée (mélange rôles/clients ; duplication).
  * La piste « **centraliser les rôles (experts)** + **onboarding client unifié** » **est la bonne** et doit être généralisée. 
* **Gouvernance / Hiérarchie** :

  * `ARKORE01-HIERARCHY.yaml` existe **en 3 exemplaires** (dont **2 dans META**) → **duplicata** / risque de divergence.
  * **META** : 52 fichiers YAML **avec un `id`** (briques “vivantes”) trouvés dans `ARKA_META/…` → usage **hors politique** (META devrait rester **I/O**, pas gouvernance).

---

## 🔴 Constat critique (root cause de « je ne trouve pas les workflows »)

1. **Router manquant** dans ARKA_FLOW → **aucune** règle déclarative pour passer d’un **intent** à un **flow_ref**.
2. **Nomenclature (wake‑up matrix)** **déconnectée** des intents effectifs (16 intents du manifest ne sont pas mappés).
3. **Hiérarchie ARKORE dupliquée** (dont des copies dans META) → selon le point d’entrée, les agents ne “voient” pas la même carte.

> Conséquence : même si les workflows **existent**, **ils ne sont pas adressables**.
> Pas de “GPS” unique : pas d’intent canonique, pas de router, pas de point d’entrée hiérarchique unique.

---

## 🔗 Nomenclature ↔ Workflow : **comment ça doit s’articuler (sans figer la nomenclature)**

**But** : que n’importe quel agent parte d’un **terme** (humain, alias, tag), obtienne un **intent canonique**, puis un **flow_ref**, **sans connaître le disque**.

**Chaîne minimale (pull + déterministe)**

1. **Nomenclature vivante** (service/registry léger) :

   * Source : un YAML **lisible humain** (CI), mais servi **en lecture** via une API/CLI (pas figé).
   * Chaque entrée :
     `id` (= intent canonique, ex : `AUDIT:RGPD`) · `aliases` · `tags` · `owner` · `related_docs` · **`related_workflows`** (→ `flow_ref`).
2. **Router FLOW** : associe **`intent` → `flow_ref`** (ID:EXPORT) — **une seule source** (`router/routing.yaml`).
3. **Point d’entrée ARKORE** : `ARKORE01-HIERARCHY` **doit référencer le registry et FLOW** (adresse logique).
4. **Wake‑up matrix** : devient la **façade** (vocabulaire utilisateur → `id` nomenclature).
5. **Résolution** :

   * *lookup* (terme → `id`),
   * *resolve* (`id`/intent → `flow_ref` via router),
   * *load* (export YAML) → exécution.

> On ne fige pas la nomenclature : **on la sert**. Elle reste éditable (YAML + CI), mais **adressable** pour les agents.

---

## 🧭 Où chercher quoi (carte mentale simple)

* **ARKA_OS/**

  * `ARKA_CORE/` : gouvernance (hiérarchie, règles globales, policies).
  * `ARKA_FLOW/` : **index + manifest** OK, **router manquant**.
  * `ARKA_AGENT/` : agents **éparpillés par client**, **onboarding absent**.
  * `wakeup-intents.matrix.yaml` : présent mais **non mappé** aux intents actuels.
  * `bin/`, `scripts/` : runtime/outillage.
* **ARKA_META/** : **I/O uniquement** (aujourd’hui : beaucoup de briques actives, **à purger ou rapatrier**).
* **ARKA_EXT/**, **ARKA_PROFIL/** : à inventorier par usage, mais rien de bloquant vs la résolution des workflows.

---

## ⚠️ Hotspots (à corriger en priorité)

1. **Ajouter le `router/routing.yaml`** à `ARKA_OS/ARKA_FLOW/` (source unique, déclarative).
2. **Remettre la hiérarchie** : **garder un seul** `ARKORE01-HIERARCHY.yaml` (celui de `ARKA_OS/ARKA_CORE/bricks/`), supprimer/ignorer les clones META.
3. **Raccorder la nomenclature** : mettre en place un **registry léger (lookup/resolve)** et **brancher** `wakeup-intents.matrix.yaml` dessus.
4. **Agents** : enclencher la refonte **experts/** + **onboarding client unifié** (ta piste), et **indexer** les on‑boardings (catalogue des agents) pour la découverte. 
5. **META** : extraire les 52 YAML **à gouvernance** hors de META (I/O only), les reclasser (CORE/FLOW/AGENT).

---

## ✅ Ce que j’ai déjà vérifié / mesuré

* **MANIFEST FLOW** : 16 intents présents (catalogue OK).
* **INDEX FLOW** : 11 briques enregistrées.
* **WAKe‑UP** : 0 intent reconnu → **désalignement total** vs manifest.
* **ROUTER FLOW** : manquant → **l’agent ne peut pas “trouver la route”** même si le manifest est là.
* **AGENTS** : duplication client‑centrée, **onboarding.yaml absent**.

*(Toutes ces observations sont dans les JSON/CSV fournis.)*

---

## 🎯 Plan d’audit étendu (sur 3–5 jours ouvrables)

1. **Inventaire exhaustif & scoring**

   * Lister toutes les briques `id/version/exports` (fait pour une première passe).
   * Identifier **sources de vérité** (hiérarchie, nomenclature, manifest, index) vs **copies**.
   * Marquer blocages (router manquant, wake‑up déconnecté).
2. **Audit sémantique “découvrabilité”**

   * Chaque besoin (workflow, doc, policy, owner) doit être trouvable **depuis un point d’entrée unique**.
   * Vérifier/compléter les **références croisées** (doc ↔ nomenclature ↔ workflow ↔ owner).
3. **Audit agents**

   * Cartographier rôles → experts/clients, puis **échafauder le plan “experts + onboarding”** (gabarit + migration auto). 
4. **Audit META**

   * Lister les briques actives stockées en META, proposer re‑logement (CORE/FLOW/AGENT).
5. **Jeux de tests**

   * Smoke tests : pour chaque intent du manifest → `resolve` → `load` (doit passer).
   * Vérifs CI : orphelins (workflow sans nomenclature, nomenclature sans workflow), doublons d’alias, owners manquants.

---

## 🧩 Réponse concrète à ta question « comment lier **nomenclature** à **workflow** ? »

* **Dans la nomenclature (service)** : chaque term **porte** un `related_workflows: [ "ID:EXPORT", … ]`.
* **Dans le MANIFEST FLOW** : chaque entrée **porte** `nomenclature_id: "PREFIX:SUJET"`.
* **Dans la matrice wake‑up** : la **clé** (ou l’alias mappé) **renvoie** vers l’`id` nomenclature.
* **Le router** : **fait la résolution** `intent (== id nomenclature) → flow_ref`.
* **L’agent** : ne lit **ni dossiers ni fichiers** → il interroge le **registry** (lookup) puis le **router** (resolve).
  → C’est **simple à trouver** *et* **simple à emprunter**.

---

## Prochaine étape proposée (0‑rollback, sans transition “douce”)

Je te propose un **lot minimal, prêt à merger** :

1. **`ARKA_OS/ARKA_FLOW/router/routing.yaml`** (à partir du manifest actuel)
2. **`wakeup-intents.matrix.yaml`** réconcilié **avec les 16 intents** actuels
3. **`ARKORE01-HIERARCHY.yaml`** (unique, côté CORE) **référençant** : `registry` (nomenclature) + `flow`
4. **`experts/ + clients/<id>/agents/<agent>/onboarding.yaml`** (gabarit validé) + **index agents**
5. **CI de découverte** (lint + smoke resolve/load + orphelins)

Si tu valides, je génère le **pack “fix‑audit‑lot‑1”** (router + wake‑up aligné + patch hiérarchie + check CI + gabarit onboarding) à partir de **ton zip courant**, sans toucher au reste.

---

### Note sur la réorganisation des agents

Ta **piste** (rôles centralisés + onboarding client unifié) est **confirmée** par l’audit et je m’y aligne pour la suite du plan. 


Parfait — on se recentre et on *termine* **1) l’audit complet** et **2) la cartographie ARKA** (OS + satellites).
Je te remets des **preuves téléchargeables** et une **vue d’ensemble exploitable** sans attendre les étapes 3–5.

---

## 1) Audit complet (OS + satellites)

> **Méthode** — analyse statique de ton archive `ARKA_LABS.zip` (inventaire fichiers, recherche YAML porteurs d’`id`, présence/absence des points d’entrée, cohérence MANIFEST ↔ wake‑up, structure agents).
> **Artefacts d’audit (telechargeables)** :
>
> * **Résumé chiffré** : [summary.json](sandbox:/mnt/data/ARKA_AUDIT_ARTIFACTS/summary.json)
> * **Vue par dossiers racine** : [top_overview.csv](sandbox:/mnt/data/ARKA_AUDIT_ARTIFACTS/top_overview.csv)
> * **YAML avec `id`** : [yaml_with_ids.csv](sandbox:/mnt/data/ARKA_AUDIT_ARTIFACTS/yaml_with_ids.csv)
> * **Écarts MANIFEST vs wake‑up** : [manifest_wakeup_compare.json](sandbox:/mnt/data/ARKA_AUDIT_ARTIFACTS/manifest_wakeup_compare.json)
> * **Détails clés (router, index, agents, META, etc.)** : [audit_details.json](sandbox:/mnt/data/ARKA_AUDIT_ARTIFACTS/audit_details.json)
> * **Snapshot “catalogue unifié”** : [registry_snapshot.json](sandbox:/mnt/data/ARKA_AUDIT_ARTIFACTS/registry_snapshot.json)

### 1.1 Constats majeurs (bloquants)

* **FLOW — router manquant**
  Dans `ARKA_OS/ARKA_FLOW/`, **pas de** `router/routing.yaml` → aucun chaînage **intent → flow_ref** (même si **MANIFEST** et **INDEX** existent).
  **Impact** : les agents ne peuvent *pas adresser* les workflows par intent ; on reste dépendant d’un producteur “qui sait”.
  **Preuve** : `router_files: []` dans *audit_details.json*.

* **Wake‑up (nomenclature runtime) désaligné**
  `ARKA_OS/wakeup-intents.matrix.yaml` ne référence **aucun intent canonique** détectable, alors que le **MANIFEST FLOW** expose **16 intents** (familles `AUDIT:*`, `DELIVERY:*`, `DOC:*`, `OPS:*`, `MKT:*`, `PEOPLE:*`).
  **Impact** : le vocabulaire d’entrée (ce que les agents “entendent”) n’aboutit pas à des workflows.
  **Preuve** : voir *manifest_wakeup_compare.json* (liste des intents présents dans MANIFEST mais absents du wake‑up).

* **Gouvernance dupliquée / non localisée**
  Plusieurs **briques avec `id`** sont stockées dans **`ARKA_META/`** (I/O) — dont des variantes de hiérarchie.
  **Impact** : *race conditions* de départ, “qui lit quoi ?” selon le chemin ; incohérences possibles au boot.
  **Preuve** : `meta_yaml_with_id_count` + exemples dans *audit_details.json*.

### 1.2 Constats structurants (haute priorité)

* **Agents — structure éclatée par client, onboarding absent**
  Multiples chemins `ARKA_OS/ARKA_AGENT/clients/...` + `experts/…` sans **onboarding.yaml** unifié ; duplication cross‑client.
  **Impact** : coûts de maintenance élevés, découverte difficile, montée de version fragile.
  **Référence** (piste de refonte validée) : centraliser rôles sous `experts/` + *onboarding* client unifié (`clients/<CLIENT_ID>/agents/<agent_id>/onboarding.yaml`). 

* **Docs — liant manquant**
  Les docs Markdown existent, mais **pas** de convention *front‑matter* (ex. `arkaref`) exploitée à l’échelle du repo pour relier **termes ↔ workflows ↔ owners**.
  **Impact** : la recherche “par sujet” ne renvoie pas systématiquement vers la bonne route.

### 1.3 Synthèse risques → impacts

| Risque                        | Impact opérationnel                                                |
| ----------------------------- | ------------------------------------------------------------------ |
| Router FLOW manquant          | Pas d’**adressage** des workflows par intent ; navigation manuelle |
| Wake‑up non mappé au MANIFEST | “Intent inconnu” côté agents ; perte de temps/itérations           |
| Hiérarchie/bricks en META     | Incohérences de boot ; comportements divergents                    |
| Agents éclatés                | Duplication, fidélité inégale, dette “client‑centrée”              |
| Docs sans *arkaref*           | Découvrabilité faible, ambiguïtés de procédure                     |

---

## 2) Cartographie ARKA (vue système)

> Objectif : donner **une carte simple** des *sources de vérité* et des *points d’entrée* — telle qu’elles existent **aujourd’hui** — pour que chacun sache “où chercher quoi” (workflows **et le reste**).

### 2.1 Carte “facettes” (ce qu’on doit pouvoir trouver)

| Facette                            | Source(s) de vérité actuelle       | Fichier(s) / Exemples                                                                         | Statut                         |
| ---------------------------------- | ---------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------ |
| **Workflows (FLOW)**               | MANIFEST + INDEX (router manquant) | `ARKA_OS/ARKA_FLOW/bricks/ARKFLOW-00-MANIFEST.yaml`, `ARKA_OS/ARKA_FLOW/ARKFLOW00-INDEX.yaml` | **Partiel**                    |
| **Intents (nomenclature runtime)** | wake‑up matrix                     | `ARKA_OS/wakeup-intents.matrix.yaml`                                                          | **Désaligné**                  |
| **Nomenclature canonique**         | (à formaliser)                     | — (manque un `ARKA_NOMENCLATURE.yaml`)                                                        | **Manquante**                  |
| **Capacités (CAPAMAP)**            | CAPAMAP                            | `ARKA_OS/ARKA_FLOW/bricks/ARKFLOW-CAPAMAP01-CAPABILITY-MATRIX.yaml`                           | **OK**                         |
| **Agents (rôles/clients)**         | experts + clients/*                | `ARKA_OS/ARKA_AGENT/experts/**`, `ARKA_OS/ARKA_AGENT/clients/**`                              | **Hétérogène**                 |
| **Docs (procédures/ADR)**          | Markdown                           | `ARKA_OS/**.md` (sans *arkaref*)                                                              | **Non relié**                  |
| **Hiérarchie**                     | (doit être unique)                 | `ARKA_OS/ARKA_CORE/...HIERARCHY.yaml` **uniquement**                                          | **Dupliquée** (copies en META) |

> **NB** : la refonte agents (experts + onboarding) est l’axe accepté ; on la traitera à l’étape 5. 

### 2.2 Carte “par dossiers” (topologie observée)

```
ARKA_OS/
  ARKA_CORE/         # gouvernance, hiérarchie (doit rester la seule)
  ARKA_FLOW/         # workflows: MANIFEST + INDEX (router absent)
  ARKA_AGENT/        # experts/ + clients/<id>/..., onboarding unifié manquant
  ARKA_EXT/          # extensions (à inventorier)
  ARKA_PROFIL/       # profils (à inventorier)
  bin/ scripts/      # outils runtime
  wakeup-intents.matrix.yaml  # vocabulaire runtime (à réaligner)
ARKA_META/           # I/O : contient aujourd’hui des briques 'id' => à purger/migrer
```

### 2.3 Carte “routage logique” (ce que doit faire le système)

1. **Terme/alias** (humain) → **Intent canonique** (*lookup* via nomenclature/wake‑up).
2. **Intent** → **Flow ref** (*resolve* via **router FLOW**).
3. **Flow ref** → **séquence d’étapes** (bricks) + **sélection d’acteur** (CAPAMAP).
4. **Docs / Policies / ADR** reliés au même intent (front‑matter).
5. **Agents** : *experts* (rôles) + *onboarding client* pour l’exécution.

> Aujourd’hui, **(2)** manque (router), **(1)** ne pointe pas vers les 16 intents du MANIFEST, **(4)** n’est pas encore câblé par front‑matter, **(5)** n’est pas normalisé (onboarding).

### 2.4 Carte “familles d’intents” (déjà présentes dans le MANIFEST FLOW)

* **AUDIT** : `FILES`, `TREE`, `RGPD`, `COMPLIANCE`, `FEATURE`, `ACCOUNTING`
* **DELIVERY** : `EPIC`, `FEATURE`, `US`
* **DOC** : `ADR`, `CONTENT`
* **OPS** : `BUGFIX`, `SECURITY`, `DATA_REPORT`
* **MKT** : `CAMPAIGN`
* **PEOPLE** : `HR_CHANGE`
  → **16 intents** à **refléter** dans la nomenclature/wake‑up et à **router** vers leurs exports.

---

## Ce que je **n’inclus pas** ici (volontairement)

* Pas de plan d’action détaillé (c’est l’étape **3**).
* Pas d’implémentation de correctifs (c’est l’étape **4**).
* Pas de refonte agents ni GPS (ce sera **5**).

---

## TL;DR (net et actionnable)

* **Preuves déposées** : *summary.json*, *top_overview.csv*, *yaml_with_ids.csv*, *manifest_wakeup_compare.json*, *audit_details.json*, *registry_snapshot.json*.
* **Bloquants** : **router FLOW absent**, **wake‑up non mappé aux 16 intents**, **gouvernance disséminée (META)**, **agents éclatés**.
* **Cartographie** : table des facettes + topologie par dossiers + routage logique + familles d’intents.


