Fonctionnement **Messagerie** et **Notification** d’ARKA — dans sa **version alignée** : *dev = prod*, **sans SSE**, **threads‑only**, **Option A (attach_only)**, et **zéro réponse chat**.

---

# ARKA — Guide Messagerie & Notification (threads‑only)

> **But** : rendre le flux **prédictible**, **scalable** et **lisible par humain**, tout en empêchant les dérives (ACK LLM, réponses chat, sessions fantômes).

**Résumé exécutif**

* **Dev = Prod** : même contrat, même daemon, même règles.
* **Sans SSE** : la notif passe **uniquement** par un **journal local** consommé par **un daemon unique**.
* **Threads‑only** : un **sujet = un fil** (`messaging/threads/<thread-ref>/`).
* **Réponse = fichier** (STATUS/RESULT), **jamais** une bulle chat.
* **Option A** : **pas** de création de session par la plateforme ; si session absente → **BLOCK + retour expéditeur + escalade PMO→Owner**.
* **Idempotence** stricte : `message_id` unique ⇒ **0 doublon**.
* **Guardians** : **bloqueurs** (anti‑ACK, anti‑chat, gabarits) + traces + escalades.

---

## 1) Glossaire (très court)

* **Fil (thread)** : dossier unique qui regroupe tous les messages multi‑agents d’un **même sujet**.
* **Message strict** : fichier YAML append‑only (STATUS/RESULT) déposé **dans le fil**.
* **general.yaml** : chronologie **globale** (append‑only) qui **pointe** vers chaque message écrit.
* **Notification (notify)** : enveloppe JSON qui **déclenche** l’exécution ; **zéro réponse chat**.
* **Daemon notify** : lecteur séquentiel **unique** du journal d’événements ; pousse dans la session, applique Option A.
* **Guardians** : police d’exécution (bloqueurs + escalade + preuves).
* **Option A** : **attach_only**, allow‑list ; pas de création de session ; block + retour + escalade.

---

## 2) Architecture (vue d’ensemble)

```
[Agent/Orchestrateur] 
    └─ écrit 1) un message strict + 2) une notify v1
           │
           ▼
[Journal local (SQLite/WAL)]  ← idempotence (message_id), file d’événements
           │
           ▼
[Notify-daemon (instance unique)] — profil provider (Codex)
           │         └─ Option A (attach_only): refuse la création de sessions
           │
           ├─► Session active autorisée → soumission (bloc → Enter → "" → Enter → Enter)
           │                                    └─ "UI gate" : chat silencieux
           │
           └─► Session absente/hors liste → BLOCK + retour expéditeur + escalade PMO/Owner
```

**Invariants clés**

* **Pas de SSE** (zéro flux événementiel réseau interne).
* **Un seul daemon** (verrou OS + lease DB).
* **Séparation chat/message** : la **réponse** est **un fichier** (STATUS/RESULT), pas une bulle.
* **Idempotence** : `message_id` unique → pas de répétition.

---

## 3) Messagerie — **threads‑only**

### 3.1 Arborescence

```
messaging/
  threads/
    THR-1f3b9c__onboarding-fsx/
      2025-10-20T08-00-00Z__pmo@fsx__TODO.yaml
      2025-10-20T08-16-01Z__archiviste@fsx__RESULT.yaml
      index.yaml
      Attachments/
ARKA_META/
  messaging/
    general.yaml      # version: 2, append‑only
```

* **Un sujet = un fil** (`THR-<shortid>__<topic-slug>`).
* **Tous les échanges** sur ce sujet vivent **dans ce dossier**.
* `index.yaml` : **synthèse locale** du fil (participants, messages, derniers états).
* `general.yaml` : **chronologie globale** (append‑only) qui **pointe** le **chemin réel** de chaque message.

### 3.2 Nommage des fichiers de message

```
<ISOZ>__<from>@<to>__<STATUS>.yaml
# ex. 2025-10-20T08-16-01Z__archiviste@fsx__RESULT.yaml
```

**Statuts** (si `type: STATUS`) : `TODO | IN_PROGRESS | BLOCKED | OBSOLETE`.

### 3.3 Gabarit d’un message strict

```yaml
tid: T-XXXXXX
type: STATUS | RESULT
status: TODO | IN_PROGRESS | BLOCKED | OBSOLETE     # si type = STATUS
thread_id: THR-1f3b9c__onboarding-fsx               # requis
relates_to: msg-20251020-0001                       # requis (ID du message source)
from: Archiviste
to: FSX
sujet: "Onboarding FSX"
message: |
  Texte impératif, actionnable (done / todo / next steps).
links:
  attachments: []
  output: []   # liens relatifs ; ne pas copier les livrables
```

**Règles** : `append-only`, `relates_to` **requis**, `thread_id` **requis**, **zéro** ACK LLM, **zéro** bulle chat.

### 3.4 `index.yaml` (dans chaque fil)

```yaml
version: 2
thread_id: THR-1f3b9c__onboarding-fsx
subject: "Onboarding FSX"
participants: ["PMO","FSX","Archiviste"]
created_at: "2025-10-20T08:00:00Z"
last_update: "2025-10-20T08:16:01Z"
messages:
  - ts: "2025-10-20T08:00:00Z"
    file: "2025-10-20T08-00-00Z__pmo@fsx__TODO.yaml"
    status: "TODO"
    message_id: "msg-..."
  - ts: "2025-10-20T08:16:01Z"
    file: "2025-10-20T08-16-01Z__archiviste@fsx__RESULT.yaml"
    status: "RESULT"
    message_id: "msg-..."
```

### 3.5 `ARKA_META/messaging/general.yaml` (chronologie globale)

```yaml
version: 2
entries:
  - ts: "2025-10-20T08:16:01.671Z"
    kind: "result"    # status|result|notify|decision|escalation|return_to_sender|system
    thread_id: "THR-1f3b9c__onboarding-fsx"
    message_id: "msg-20251020-0001"
    from: "Archiviste"
    to: "FSX"
    subject: "Onboarding FSX"
    status: "RESULT"
    path: "messaging/threads/THR-1f3b9c__onboarding-fsx/2025-10-20T08-16-01Z__archiviste@fsx__RESULT.yaml"
    tags: ["onboarding","fsx"]
```

> **Pourquoi cette chronologie ?** Pour reconstituer **rapidement** l’historique global (tri par temps, recherche par `message_id`/`thread_id`) **sans** ouvrir tous les dossiers.

---

## 4) Notification — **contrat v1 (dev = prod, sans SSE)**

### 4.1 Enveloppe (JSON) — champs **requis**

* `type:"notify"`, `v:1`, `message_id` (unique), `ts`
* **Session** **ou** (**project** + `to_agent` **rôle**)
* `provider` (ex. `"codex"`), `session_prefix` (ex. `"arka"`)
* `resource.pointer` (ex. `arkamsg://inbox/arka-agent00-core-archivist`)

```json
{
  "type": "notify",
  "v": 1,
  "message_id": "msg-20251020-0001",
  "ts": 1734710400000,
  "project": "arka-labs-b",
  "to_agent": "Archiviste",
  "provider": "codex",
  "session_prefix": "arka",
  "resource": { "pointer": "arkamsg://inbox/arka-agent00-core-archivist" },
  "metadata": { "thread_id": "THR-1f3b9c__onboarding-fsx" }
}
```

**Idempotence** : `message_id` unique.
**Transport** : journal local (SQLite/WAL).
**Consommation** : daemon **unique** (verrou + lease), lecture séquentielle, backoff, dead‑letter.

### 4.2 Résolution de session & **Option A**

* Si `session` fourni → **utiliser tel quel**.
* Sinon → composer `"<prefix>-<project>-<to_agent>-<provider>"`, **après alias** “ID technique → rôle”.
* **Option A (attach_only)** : **pas** de création de session par la plateforme.

  * Session absente / hors allow‑list → **BLOCK**
  * **Retour expéditeur** : “session {IDAgent} non active — message non livré”
  * **Escalade** : PMO (ou Owner si PMO expéditeur ou inactif)
  * **Jamais** de retry d’envoi vers une session inexistante.

### 4.3 Profil provider (Codex)

**Soumission dans la session** :

* bloc → **Enter** → **`""` brut** → **Enter** → **Enter**
* **Ne pas échapper** la ligne `""`.
* **UI gate** : le chat reste **muet** ; la réponse attendue est **un fichier** dans le fil.

---

## 5) Rôles & responsabilités

* **Orchestrateur** : déclenche l’envoi (écrit message + notify), **ne raisonne pas**, pas de polling.
* **Agents LLM** : **lisent le message**, exécutent, **écrivent un fichier** STATUS/RESULT **dans le fil** ; **zéro** ACK LLM, **zéro** bulle chat.
* **PMO / Owner** : reçoivent les **escalades** (Option A).
* **Guardians** : **bloqueurs** (ACK, chat après notify, gabarit illégal), escalades, preuves.
* **Archiviste** : sur demande, produit des index lisibles (jamais en continu).

---

## 6) Workflow agent — **pas à pas**

1. **Lire** le message (pull + mark read).
2. **Travailler** (exécution, collecte d’évidences).
3. **Écrire** un **STATUS** (TODO/IN_PROGRESS/BLOCKED/OBSOLETE) **ou** un **RESULT** **dans le fil** (`thread_id` + `relates_to` requis).
4. **Mettre à jour** la **chronologie globale** (`general.yaml`) avec le **chemin réel** du fichier.
5. **Jamais** de réponse chat ; **jamais** d’ACK LLM.

**Cas BLOCKED** : cause **claire**, **1–3** questions max ; escalade si policy l’exige.
**Fin de travail** : `type: RESULT` (**pas** “STATUS: complete”).

---

## 7) Guardians — **enforcement réel**

**Bloqueurs** (exemples) :

* `block_llm_ack_file` : refuse tout fichier ACK produit par un LLM (l’ACK est **transport**).
* `block_chat_output_after_notify` : **interdit** toute bulle chat après une notify.
* `block_illegal_status` : refuse un STATUS **hors gabarit** (pas de `relates_to`, pas de `thread_id`, etc.).

**Escalade** : PMO → Owner ; log des violations + evidence pack.
**Traces** : preuve du blocage et du motif.

---

## 8) Observabilité & Santé

* **Status** : lag, erreurs récentes, instance daemon, **compteurs** :

  * `blocked_missing_session_total`, `allowlist_reject_total`,
  * `notify_return_to_sender_total`, `escalation_to_pmo_total`, `escalation_to_owner_total`.
* **Doctor (mode lab)** : DB + harness “codex‑sim” **sans LLM** (0 token), vérifie la séquence (Enter + `""`) et l’état `delivered`. **PASS < 2 min**.
* **Canary réel** (rare) : max 3 notifs/jour vers sessions **canary** dédiées (pas les sessions prod).

---

## 9) Bonnes pratiques

**À faire**

* Toujours **réutiliser** le `thread_id` du message source.
* Écrire `relates_to` **obligatoirement**.
* Rédiger un **texte impératif** (actionnable) — pas de conditionnel mou.
* Alimenter `general.yaml` à chaque écriture.

**À proscrire**

* Répondre dans le **chat** après notify.
* Produire un **ACK** côté LLM.
* Écrire hors du fil (`messaging/threads/...`).
* Réutiliser un `message_id` (casse idempotence).

---

## 10) Exemples rapides

**Notify JSON (contrat v1)**

```json
{
  "type":"notify","v":1,"message_id":"msg-20251020-0001","ts":1734710400000,
  "project":"arka-labs-b","to_agent":"Archiviste","provider":"codex","session_prefix":"arka",
  "resource":{"pointer":"arkamsg://inbox/arka-agent00-core-archivist"},
  "metadata":{"thread_id":"THR-1f3b9c__onboarding-fsx"}
}
```

**Message RESULT (dans le fil)**

```yaml
tid: T-129834
type: RESULT
thread_id: THR-1f3b9c__onboarding-fsx
relates_to: msg-20251020-0001
from: Archiviste
to: FSX
sujet: "Onboarding FSX"
message: |
  Résultat appliqué. Évidences référencées.
links:
  output:
    - ARKA_META/OUTPUT/fsx/onboarding/report.md
```

**Entrée `general.yaml` correspondante**

```yaml
- ts: "2025-10-20T08:16:01.671Z"
  kind: "result"
  thread_id: "THR-1f3b9c__onboarding-fsx"
  message_id: "msg-20251020-0001"
  from: "Archiviste"
  to: "FSX"
  subject: "Onboarding FSX"
  status: "RESULT"
  path: "messaging/threads/THR-1f3b9c__onboarding-fsx/2025-10-20T08-16-01Z__archiviste@fsx__RESULT.yaml"
  tags: ["onboarding","fsx"]
```

---

## 11) Checklists (prêtes à imprimer)

**Agent (à chaque notif)**

* [ ] J’ai **lu** le message (pull + read).
* [ ] Je connais le **thread_id** et je reste **dans le fil**.
* [ ] Je produis **STATUS** ou **RESULT** (append‑only).
* [ ] Je remplis `relates_to`, `thread_id`, `from`, `to`, `sujet`.
* [ ] J’alimente **general.yaml** avec le **path** du fichier écrit.
* [ ] **Aucune** bulle chat ; **aucun** ACK LLM.

**Ops (santé plateforme)**

* [ ] Un **seul** daemon notify actif.
* [ ] Compteurs d’erreur **faibles** (status).
* [ ] **Doctor (lab)** PASS < 2 min ; **canary** OK si planifié.
* [ ] **0** session fantôme (Option A).

---

## 12) Foire aux questions

**Q1. Pourquoi interdire la réponse chat ?**
Pour garantir un **flux déterministe** et **archivable** ; le chat est volatile, les fichiers sont lisibles et audités.

**Q2. Pourquoi threads‑only ?**
Pour éviter l’explosion de **dossiers épars** : un **fil unique par sujet**, clair et navigable.

**Q3. Comment gère‑t‑on une session manquante ?**
**Option A** : **BLOCK + retour expéditeur + escalade** (PMO→Owner). **Aucune** création silencieuse.

**Q4. Où se trouve l’historique global ?**
Dans `ARKA_META/messaging/general.yaml` (append‑only), qui **pointe** le chemin exact de chaque message.

---

## 13) Critères de “Done”

1. **Doctor (lab)** PASS < 2 min.
2. **Campagne interne** (DB/harness) 100/100 delivered, 0 doublon.
3. Redémarrage daemon : reprise **sans perte ni duplication**.
4. Status et Guardians **actifs** ; **0** réponse chat après notify ; **0** ACK LLM.
5. Filtration sessions : **Option A** en place ; **0** session fantôme.

---

*Fin du document.*
