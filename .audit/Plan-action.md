**étape 3 : le plan d’action** (priorisé, séquencé, avec critères d’acceptation) pour corriger ce que l’audit a mis en évidence et préparer la suite.

> **Rappel des 3 bloquants majeurs (audit)**
> ① Router FLOW **absent** ⇒ impossible de résoudre `intent → flow_ref`
> ② Wake‑up (nomenclature runtime) **désaligné** du MANIFEST (16 intents manquants)
> ③ Gouvernance **dissimulée dans META** (+ hiérarchie dupliquée)
>
> * structurants : structure **agents** éclatée, docs **non reliées** (pas de front‑matter)

---

## Plan d’action (priorisé, prêt à exécuter)

### Lot 1 — **Rétablir l’adressage des workflows**

**Objectif.** Rendre fonctionnel le chaînage `intent → flow_ref → steps` pour *tous* les intents du MANIFEST.

* **Action 1.1 — Créer le router FLOW (source unique).**
  Chemin : `ARKA_OS/ARKA_FLOW/router/routing.yaml`
  Contenu : 1 règle `by: intent` par intent du MANIFEST (AUDIT, DELIVERY, DOC, OPS, MKT, PEOPLE).
  **Critères d’acceptation**

  * Fichier présent et valide YAML.
  * Pour chaque intent du MANIFEST, `arkaflow resolve --intent <INTENT>` renvoie un `flow_ref` existant (test sur les 16).
  * Zéro export manquant (`arkaflow load --flow <flow_ref>` passe pour tous).

* **Action 1.2 — Contrôle croisé MANIFEST ↔ INDEX ↔ ROUTER.**
  Script de vérif (CI) :

  * *tous* les `flow_ref` du router existent dans l’INDEX,
  * l’INDEX ne contient pas d’exports orphelins,
  * le MANIFEST liste **exactement** les intents activés par le router (ou superset consenti).
    **Critères d’acceptation**
  * Rapport “orphan/extra” vide.
  * Sortie CI = **OK** (pas de warning bloquant).

---

### Lot 2 — **Aligner la nomenclature (wake‑up) avec les workflows**

**Objectif.** Qu’un terme/alias mène *toujours* à un intent canonique, puis au workflow.

* **Action 2.1 — Introduire une nomenclature canonique légère.**
  Fichier : `ARKA_OS/ARKA_CORE/bricks/ARKA_NOMENCLATURE01.yaml`
  Pour chaque intent du MANIFEST : `id` (= intent), `label`, `aliases[]`, `tags[]`, `related_workflows[]` (→ `ID:EXPORT`), `owner`, `related_docs[]` (si connu).
  **Critères d’acceptation**

  * Les 16 intents du MANIFEST sont présents en `terms[]`.
  * Aucun `id` en doublon ; chaque `related_workflows` pointe vers un export existant.

* **Action 2.2 — Réconcilier `wakeup-intents.matrix.yaml`.**
  Refaire la matrice à partir de la nomenclature (ou la faire référencer la nomenclature).
  **Critères d’acceptation**

  * Chaque intent du MANIFEST est atteignable via wake‑up (alias inclus).
  * Script de test “lookup → intent” passe pour les 16.

* **Action 2.3 — Tests “lookup → resolve → load”.**
  Pour chaque intent :

  1. lookup par un alias, 2) resolve (router), 3) load (export), 4) check séquence.
     **Critères d’acceptation**

  * 16/16 passent, zéro fallback “best guess”.

---

### Lot 3 — **Assainir la gouvernance (hiérarchie & META)**

**Objectif.** Une carte **unique** lue par les daemons ; aucune brique de gouvernance en *META*.

* **Action 3.1 — Unifier la hiérarchie.**
  Conserver **un seul** `ARKORE01-HIERARCHY.yaml` (dans `ARKA_CORE`), supprimer/ignorer tout doublon.
  Ajouter les nœuds déclaratifs :

  * `flow:` (index, router, manifest),
  * `registry:` (nomenclature/wake‑up),
  * *(GPS sera branché plus tard)*.
    **Critères d’acceptation**
  * Un seul fichier hiérarchie présent.
  * Lancement de daemons avec ce point d’entrée **sans override**.

* **Action 3.2 — Purge META.**
  Identifier **tous les YAML avec `id`** dans `ARKA_META/` et les reloger (CORE/FLOW/AGENT) selon leur nature.
  **Critères d’acceptation**

  * META ne contient plus de briques “actives” (ID/version/exports).
  * Les références internes pointent vers les nouveaux chemins.

---

### Lot 4 — **Lier les documents (docs) au système**

**Objectif.** Que la documentation soit découvrable par sujet **et** reliée aux workflows et owners.

* **Action 4.1 — Front‑matter `arkaref` dans les docs clés.**
  Ajouter en tête des MD :

  ```yaml
  ---
  arkaref:
    nomenclature: "AUDIT:RGPD"
    workflow: "ARKFLOW-04A-WORKFLOWS-AUDIT:AUDIT_RGPD_CHAIN"
    owner: "SecurityComplianceArchitect"
  ---
  ```

  **Critères d’acceptation**

  * 1 doc au moins par *famille d’intent* porte un `arkaref` valide.
  * Linter CI “doc↔workflow↔owner” passe.

---

### Lot 5 — **Pré‑cadre refonte agents (sans la faire ici)**

**Objectif.** Geler l’architecture cible pour fluidifier l’étape 5.

* **Action 5.1 — Schéma `onboarding.yaml` (format unifié).**
  Dossier cible : `ARKA_OS/ARKA_AGENT/clients/<CLIENT>/agents/<agent_id>/onboarding.yaml`

  * centralisation des rôles sous `experts/<role>/`.
    **Référence de cadrage** : *Réorganisation multiprojet — Préparation*. 
    **Critères d’acceptation**

  - Schéma validé (champ obligatoires, versions, liens experts/wake‑up/messagerie).

* **Action 5.2 — Index agents.**
  Générer un index lisible : client → agent_id → onboarding.
  **Critères d’acceptation**

  * Un seul point d’entrée pour découvrir tous les agents.

*(La migration concrète et le nettoyage suivront en étape 4 & 5.)*

---

## Tests & CI à ajouter (dès Lot 1)

* **`ci_resolve_all.py`** — pour chaque intent du MANIFEST :
  `resolve` (router) → `load` (export) → ✅.
* **`ci_nomenclature_lint.py`** — unicité IDs, owners présents, `related_workflows` existants, collisions d’aliases.
* **`ci_wakeup_diff.py`** — delta MANIFEST↔nomenclature↔wakeup (doit être vide).
* **`ci_docs_refcheck.py`** — parse front‑matter `arkaref`, vérifier que tout pointe sur des éléments valides.
* **`ci_meta_scan.py`** — alerte si `ARKA_META/` contient un YAML avec champ `id`.

**Sortie attendue CI** : aucun “orphan”, aucun “dangling”, aucun “dup”.

---

## RACI (proposé, minimal)

| Livrable                 | R              | A   | C                   | I              |
| ------------------------ | -------------- | --- | ------------------- | -------------- |
| Router FLOW              | TechArchitecte | AGP | Archiviste          | PMO            |
| Nomenclature & wake‑up   | PMO            | AGP | Archiviste          | Experts métier |
| Hiérarchie & purge META  | Archiviste     | AGP | TechArchitecte      | PMO            |
| Linter/CI                | LeadDev        | AGP | QATesteur           | Tous           |
| Front‑matter docs        | Scribe         | AGP | Owners de domaines  | Tous           |
| Schéma onboarding agents | PMO            | AGP | LeadDev, Archiviste | Clients        |

*(R = Responsable, A = Accountable, C = Consulté, I = Informé)*

---

## Livrables attendus par lot (pour clôturer 3 → enclencher 4)

* **L1** : `router/routing.yaml` + rapport CI resolve/load = OK.
* **L2** : `ARKA_NOMENCLATURE01.yaml` + `wakeup-intents.matrix.yaml` aligné + rapport CI lookup/resolve = OK.
* **L3** : `ARKORE01-HIERARCHY.yaml` unique + META nettoyé + rapport CI meta_scan = OK.
* **L4** : Docs clés avec `arkaref` + rapport CI docs_refcheck = OK.
* **L5** : Spéc `onboarding.yaml` + index agents (fichier) = OK.

---

### Remarques finales

* Le plan **évite toute “transition douce”** : on prépare hors‑ligne (CI + artefacts), puis on **bascule** net.
* On reste **agnostique LLM** : tout est **déclaratif** (router, nomenclature, index, front‑matter).
* La refonte agents suivra la trajectoire **experts centralisés + onboarding client unifié**, déjà cadrée. 


