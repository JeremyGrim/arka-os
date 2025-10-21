# ARKA_CORE — Modular Governance OS for Multi‑LLM

> **TL;DR**
> ARKA est un **moteur de gouvernance modulaire** qui transforme une constitution en
> **clés d’action** compactes pour LLMs, avec **mémoire durable**, **contrôles AGP sans pause**,
> et **Event Bus** pour brancher des scripts sans toucher au cœur.

---

## Sommaire

* [Vision](#vision)
* [Architecture (briques)](#architecture-briques)
* [Arborescence du repo](#arborescence-du-repo)
* [Prérequis](#prérequis)
* [Démarrage rapide](#démarrage-rapide)
* [Assemblage & Profils](#assemblage--profils)
* [Clés d’action (LLM API)](#clés-daction-llm-api)
* [Mémoire & Hooks](#mémoire--hooks)
* [Contrôle AGP **sans pause**](#contrôle-agp-sans-pause)
* [Event Bus & Extensions](#event-bus--extensions)
* [Conventions & Contrats](#conventions--contrats)
* [FAQ & Dépannage](#faq--dépannage)

---

## Vision

**Objectif** : permettre à n’importe quel LLM d’exécuter une tâche **sans lire toute la constitution**,
juste en appelant une **clé d’action** qui renvoie des **références** (routes, nommage, templates, critères) —
**jamais** des règles copiées. Chaque action **met à jour la mémoire**, et l’AGP répond en **temps réel** (no‑pause).

---

## Architecture (briques)

```
ARKA_CORE/
├─ ARKORE01–09  # Constitution modulaire (rôles, règles, workflows, specs, matrices, chemins, nommage)
├─ ARKORE12     # Action Keys : API compacte pour LLMs (FEATURE_CREATE, US_CREATE, DELIVERY_SUBMIT, ...)
├─ ARKORE13     # Templates : modèles Markdown non-normatifs
├─ ARKORE14     # Memory Ops : schéma mémoire + hooks (MEMORY_UPDATE, MISSION_INGEST, READ_CONTEXT)
├─ ARKORE15     # AGP Reactive Control : ACK→CONTROL→RETURN→(OWNER) sans pause, zones éditables
└─ ARKORE16     # Event Bus : topics, payloads, dispatch (local/webhook/stdout), subscriptions
```

**Principe clé** : une règle a **une seule source de vérité** (brique d’origine) ; partout ailleurs on utilise une **référence**.

---

## Arborescence du repo

```
bricks/                         # Briques ARKORE**.yaml
profiles/                       # Overrides par profil (ex: dev.override.yaml)
ARKA_EXT/                       # Packs d’extensions (abonnements/scripts externes)
scripts/handlers/               # Scripts appelés par l’Event Bus
bin/                            # Outils (assemble.sh, etc.)
build/                          # Sorties d’assemblage
tests/                          # Tests de contrats / fumée / events
master-assembly.yaml            # Document maître d’assemblage
ARKORE00-INDEX.yaml             # Registre des briques
README.md                       # Ce fichier
```

---

## Prérequis

* **Windows 11** : PowerShell 7+, Git, **Node 18+**, **Ruby 3+**, **jq**
* (Optionnel) **WSL** / Git Bash pour scripts bash
* Accès réseau si vous utilisez des webhooks ou des APIs (GitHub, Slack, …)

---

## Démarrage rapide

1. **Créer l’arborescence** (voir scripts fournis dans la conversation si besoin).
2. **Remplir les briques** : copier le contenu des fichiers depuis le canvas dans `bricks/*.yaml`,
   `master-assembly.yaml`, `ARKORE00-INDEX.yaml`, etc.
3. **Assembler** :

   * Bash : `bin/assemble.sh` → génère `build/assembly.yaml`
   * PowerShell : `node bin/os-assemble.mjs dev`
4. **Tester** : exécuter les tests de contrats (refs résolues, pas de doublons, invariants).
5. **Brancher vos scripts** via un pack `ARKA_EXT/ARKAEXT**.yaml` (aucune modif du moteur).

---

## Assemblage & Profils

* `master-assembly.yaml` définit les profils (**default**, **dev-light**, **strict-security**),
  l’ordre d’assemblage et les **contrats** à respecter.
* Les **overrides** (par environnement) se déclarent dans `profiles/*.override.yaml`.
* Les **packs d’extensions** (`ARKA_EXT/ARKAEXT**.yaml`) ajoutent des subscriptions/scripts.

**Exemple (bash) :**

```bash
node bin/os-assemble.mjs dev
```

---

## Clés d’action (LLM API)

Les LLMs **n’explorent pas les règles** : ils appellent une clé p.ex. `US_CREATE`.
La clé retourne **des références** vers : routes (`ARKORE08`), regex (`ARKORE09`), templates (`ARKORE13`),
critères d’acceptation (`ARKORE05`), limites d’autorité (`ARKORE06`).

### Référentiel 2.0.0 (96 actions)

| Groupe | Actions principales |
| --- | --- |
| `feature_actions` | `FEATURE_CREATE`, `FEATURE_READ`, `FEATURE_UPDATE`, `FEATURE_DELETE`, `FEATURE_MOVE`, `FEATURE_RENAME`, `FEATURE_ARCHIVE`, `FEATURE_STATUS` |
| `epic_actions` | `EPIC_CREATE`, `EPIC_READ`, `EPIC_UPDATE`, `EPIC_DELETE`, `EPIC_MOVE`, `EPIC_RENAME`, `EPIC_ARCHIVE`, `EPIC_STATUS` |
| `us_actions` | `US_CREATE`, `US_READ`, `US_UPDATE`, `US_DELETE`, `US_MOVE`, `US_RENAME`, `US_ARCHIVE`, `US_STATUS` |
| `ticket_actions` | `TICKET_CREATE`, `TICKET_READ`, `TICKET_UPDATE`, `TICKET_DELETE`, `TICKET_MOVE`, `TICKET_RENAME`, `TICKET_ARCHIVE`, `TICKET_STATUS`, `TICKET_CLOSE` |
| Livrables (`document`, `report`, `analysis`, `plan`, `contract`) | Pour chaque type : `*_CREATE`, `*_READ`, `*_UPDATE`, `*_DELETE`, `*_MOVE`, `*_RENAME`, `*_ARCHIVE`, `*_STATUS`, `*_PUBLISH` |
| Gouvernance | `ORDER_CREATE`, `ORDER_READ`, `ORDER_UPDATE`, `ORDER_DELETE`, `ORDER_ASSIGN`, `ORDER_VALIDATE`, `ORDER_CANCEL`, `ORDER_ESCALATE`, `GATE_NOTIFY`, `GATE_BROADCAST`, `DECISION_PUBLISH`, `DECISION_ARCHIVE` |
| Support | `DELIVERY_SUBMIT`, `MISSION_INGEST`, `VALIDATE_NAMING`, `ARCHIVE_CAPTURE`, `WORKFLOW_PLAN`, `REVIEW_DELIVERABLE` |

Chaque action expose `inputs`, `outputs`, `validations` et référence au minimum `ARKORE14:MEMORY_UPDATE` dans `post`. Les clés `*_CREATE` et `*_MOVE` pointent systématiquement vers les chemins `ARKORE08` pertinents et les `*_CREATE` référencent les patterns `ARKORE09`.

**Exemple `US_CREATE` (I/O) :**

```yaml
use: ARKORE12-ACTION-KEYS:action_keys.us_actions.US_CREATE
input:
  featureId: "FEAT-12"
  epicId: "EPIC-FEAT-12-03"
  usId: "US-EPIC-12-03-07"
  title: "export CSV"
  kebab_title: "export-csv"
```

**Macro minimale** : valider nommage → construire répertoires/fichiers → appliquer template → vérifier acceptance (ref).

---

## Mémoire & Hooks

* **Toujours à jour** : toute action déclenche `MEMORY_UPDATE` (**ARKORE14**).
* **Mission** : `MISSION_INGEST` + `MEMORY_UPDATE` dès réception d’un ordre.
* **Lecture rapide** : `READ_CONTEXT` renvoie N derniers enregistrements pour amorcer un LLM.
* Stockage JSONL par agent : `ARKA_META/.system/.mem/{agent}/log/YYYY-MM-DD.jsonl` + index `ARKA_META/.system/.mem/{agent}/index.json`.

---

## Contrôle AGP **sans pause**

* **ARKORE15** impose `pause_on_delivery: false` et `ack_strategy: immediate`.
* Boucle réactive sur livraison : `ACK → CONTROL_EVALUATE → AGP_MISSION_RETURN → OPTIONAL_OWNER_CONFIRM`.
* **Zones éditables** (Z1..Z4) pour ajuster ack, checks, templates, conditions d’escalade **sans toucher ailleurs**.
* Clé dédiée **`DELIVERY_SUBMIT`** (ARKORE12) pour déclencher la boucle.

---

## Event Bus & Extensions

* **ARKORE16** expose des **topics** (ex. `US_CREATED`, `MEMORY_UPDATED`, `DELIVERY_RECEIVED`, …),
  des **payloads** standard et un **dispatch** (local/webhook/stdout).
* Déclarez vos scripts via un **pack** externe (`ARKA_EXT/ARKAEXT**.yaml`) — le moteur reste inchangé.

**Exemple pack :**

```yaml
override:
  ARKORE16-EVENT-BUS:
    subscriptions:
      - on: US_CREATED
        using: local
        run: "scripts/handlers/us_created__issue_links.js"
```

---

## Conventions & Contrats

* **Aucune duplication** de règles : on **référence** la brique source.
* **SemVer** sur chaque brique ; changements majeurs = bump major + tests de contrat.
* **Contrats** : pas de doublons d’exports, refs résolues, invariants (ex. gate AGP avant PMO, limites PMO, isolation Archiviste).

---

## FAQ & Dépannage

**Q. Les refs ne se résolvent pas ?**
Vérifiez que la brique est **activée** dans le profil, que la clé existe dans l’INDEX, et la version (>= requise).

**Q. Le LLM “voit” encore trop de règles ?**
N’utilisez que **ARKORE12 (action_keys)** dans vos prompts. Le runner résout les refs (pas de copie de règles).

**Q. Où brancher mes scripts ?**
Uniquement via `ARKA_EXT/ARKAEXT**.yaml` (Event Bus). Pas de modif dans `bricks/`.

**Q. Comment forcer l’AGP à escalader au Owner ?**
Override `ARKORE15.zones.Z4_owner_confirmation.policy.when` dans votre profil.

**Q. Windows 11 ?**
Utilisez PowerShell pour créer les fichiers/dossiers et `yq` pour assembler. Bash/WSL aussi OK.

---

## Licence & Contact
MIT
Contact : à renseigner.
