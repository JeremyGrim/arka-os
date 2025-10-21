---
arkaref:
  nomenclature: OPS:SECURITY
  workflow: null
  owner: null
---
# ARKA — Spécification d’architecture (contrat v1)

**Base :** brique **PUSH** existante (*inchangée*). Ce document aligne **chat vs notify**, **backlog**, **statuts** et **rôles** pour éliminer les contradictions (ACK, polling, mélange chat/message) et fluidifier la lecture humaine.
**Principe fort dev = prod :** pas de SSE interne ; pipeline local‑first, idempotent, déterministe.

---

## 1. Principes opératoires

* **Événementiel, single‑turn** : **1 événement ⇒ 1 réponse ⇒ fin du tour**. Aucune tâche de fond côté agent.
* **Pas d’ACK côté LLM** : ni “bien reçu”, ni promesse de délai. L’ACK transport, si besoin, est géré par la passerelle.
* **Séparation stricte chat / message** :

  * **Chat ordinaire** : conversation ; **ne déclenche rien**. Si “ne réponds pas” : **silence**.
  * **Chat commande (notify)** : *format unique* ci‑dessous ; **pas de réponse chat** ; traitement via **messagerie**.
  * **Message strict (notify)** : protocole métier (STATUS / RESULT / DECISION) — **jamais via chat**.
* **Dev = prod, sans SSE** : la notification ne transite **pas** par un flux SSE ; elle passe **exclusivement** par un **journal événementiel local** (SQLite/WAL) consommé par un **notify‑daemon** **unique** (verrou OS + lease DB).
* **Idempotence stricte** : `message_id` unique ⇒ **0 doublon**.

---

## 2. Entrées via chat (commande → notify)

**Format unique (aucune réponse dans le chat)** :

```
[Notification-Auto] @DEST — Message reçu de @EXP : ptr:msg:<MESSAGE_ID> — [Message-READ]
```

**Règles :**

* **Lire obligatoirement** le message pointé **avant** d’agir (via `arkamsg pull`).
* **Aucun résumé** dans la notif (on **force** la lecture du message source).
* **Un seul destinataire** `@DEST`. Ambigu ? **Une** question de précision, puis **silence**.
* **Conflit chat + message strict** : **traiter le message**, ignorer le chat.

> *Note :* le format “chat commande” est un **alias humain** d’une **enveloppe notify v1** (cf. §10).

---

## 3. Messagerie = backlog lisible par humain

**Structure validée (on ne la change pas)** :

```
messaging/
  msg/
    <isoZ—slug>/
      TODO__from@to__slug.yaml
      IN_PROGRESS__from@to__slug.yaml
      BLOCKED__from@to__slug.yaml
      RESULT__from@to__slug.yaml
      Attachments/          # (optionnel) pièces jointes locales au fil
```

* **Append‑only** : on **ajoute**, on **n’édite pas** l’historique.
* **OUTPUT séparé** : on **ne copie pas** les livrables ; on **pointe** (liens relatifs).
* (Si présent) `ARKA_META/messaging/general.yaml` indexe globalement des **entrées** — on le **respecte tel quel**.

---

## 4. Gabarit de message (strict)

```
tid: T-XXXXXX
type: STATUS | RESULT
status: TODO | IN_PROGRESS | BLOCKED | OBSOLETE      # si type = STATUS
from: <rôle>
to: <rôle>
relates_to: <message_id>
sujet: "titre clair"
message: |
  Texte libre (court ou long).

links:                  # optionnel
  attachments:
    - ./Attachments/...
  output:
    - ARKA_META/OUTPUT/...
```

---

## 5. Statuts autorisés

* **TODO** — sélectionné, non démarré (*plan court + next step* dans `message`).
* **IN_PROGRESS** — exécution en cours (*done/todo/next step* utiles).
* **BLOCKED** — bloqué (cause claire ; **1–3** questions si arbitrage requis).
* **OBSOLETE** — supplanté/périmé (indiquer le **ptr** correct si connu).
* **Fin de travail** = `type: RESULT` (jamais “STATUS: complete”).

---

## 6. Rôles & responsabilités

* **Orchestrateur (App/Script)** : poste les notifs ; ne raisonne pas ; **pas de polling** ; **priorité au message** sur le chat.
* **Agents LLM** : répondent **une seule fois** par événement ; **jamais d’ACK** ; travaillent **uniquement** sur `ptr:msg:<ID>`.
* **Archivist** : index **sur demande** (jamais en continu) ; produit des *thread‑index* lisibles **si requis**.

---

## 7. Compatibilité (bricks)

* **Push** : *inchangée* (brique stable). Notif **JSON** conservée ; mapping 1‑1 avec le format chat.
* **Notify/Intent (ARKORE22)** : rangée sous `ARKORE/22/` pour homogénéité ; aucun champ retiré ; clarifications “chat”.
* **Messaging/Backlog** : conventions de nommage & gabarit YAML ; **aucune dépendance code**.
* **Scheduler/Auto** : réservé aux **batchs** (pas d’usage interactif).

---

## 8. Évolutions de process (sans rupture)

* **Suppression de l’ACK LLM** ; ACK transport géré côté passerelle au moment opportun.
* **Interdiction de pull continu** : en session, **aucune relève** sans notif.
* **Écriture stricte** des messages (YAML) + **liens** vers OUTPUT pour guider la lecture.

---

## 9. Conflits évités (liste de contrôle)

* “Ne réponds pas” **vs** ACK → résolu (chat commande **sans réponse** ; silence sinon).
* **Mélange chat/message** → résolu (format unique ; **priorité message**).
* **Usine à gaz** de statuts → **4 statuts + RESULT**, fin.
* **Messagerie illisible** → *fil = dossier* ; fichiers nommés par **statut** ; index agent **optionnel**.

---

## 10. Contrat d’enveloppe **notify v1** (dev = prod, sans SSE)

* **Type & version** : `type:"notify"`, `v:1`
* **Obligatoire** :

  * `message_id` (clé idempotente, unique),
  * `ts` (epoch ms ou ISO),
  * l’un des deux :
    • `session` **ou**
    • `project` + `to_agent` (rôle),
  * `provider`, `session_prefix`,
  * `resource.pointer` (ex. `arkamsg://inbox/arka-agent00-core-archivist`).
* **Optionnel** : `constraints` (array), `metadata` (objet), `sender` (id/role expéditeur).
* **Rejet immédiat** si : `session` **et** (`project`,`to_agent`) absents, ou `resource.pointer` vide.

**Résolution de session**

* Si `session` fourni ⇒ **utiliser tel quel**.
* Sinon ⇒ composer `"<session_prefix>-<project>-<to_agent>-<provider>"` **après alias** (*ID technique → rôle*, cf. §11).

**Idempotence** : `message_id` **UNIQUE** ⇒ 0 doublon.
**Transport** : écriture dans un **journal local** (SQLite/WAL).
**Consommation** : **notify‑daemon** unique (verrou OS + lease DB), lecture séquentielle, machine à états `queued → dispatched → delivered | failed`, backoff borné, dead‑letter.

---

## 11. Politique sessions (Option A) — **Attach‑only, Block + Escalade + Retour expéditeur**

* **Attach‑only** : la plateforme **n’a pas le droit** de créer une session tmux.
* **Allow‑list** : liste explicite des sessions autorisées (par **rôle**), ex.
  `arka-arka-labs-b-Archiviste-codex`, `…-PMO-codex`, `…-LD-codex`, `…-FSX-codex`.
* **Alias** obligatoires (**ID technique → rôle**), ex.
  `arka-agent00-core-archivist` → `Archiviste`, `fsx-extreme-fullstack` → `FSX`, `pmo` → `PMO`, `ld` → `LD`.
* **on_missing_session = block** : si session absente/hors liste ⇒ **BLOCK** (pas de création, pas de retry).
* **Retour expéditeur** (standardisé) :
  “**session {IDAgent} non active** — message **non livré**. Escalade : {PMO|Owner}.”
* **Escalade** :
  défaut **PMO** ; si expéditeur = PMO **ou** PMO inactif ⇒ **Owner**.
  *Une seule* escalade par `message_id`.

---

## 12. Observabilité & santé

* **Status** (lecture seule) :
  lag (plus ancien `queued`), derniers `failed/missing_session`, compteurs (`blocked_missing_session_total`, `allowlist_reject_total`, `escalation_to_*`, `notify_return_to_sender_total`), PID/host du daemon, DB path.
* **Doctor** (test E2E) :
  injecte un événement test ; attend `delivered` ; **capture le pane** et vérifie :
  `NOTIFICATION:` + **ligne `""` isolée** (profil Codex). **PASS < 2 min** sur poste propre.
  Cas négatif Option A : “session absente” ⇒ **BLOCK + retour expéditeur + escalade**, **aucune session créée**.

---

## 13. Critères de sortie (Done)

1. **Doctor PASS < 2 min** (poste propre).
2. **100/100 notifications** consécutives livrées, **0 doublon**, lag final **0**.
3. **Redémarrage daemon** : reprise **sans perte ni duplication**.
4. Status/Runbook/Journal projet **à jour** et publiés.

---

### Annexe — Rappels importants

* **Dev = prod** : mêmes chemins, même binaire, même *doctor* et *status*.
* **Zéro SSE** : pas de flux réseau interne pour déclencher une notif.
* **Aucune création de session** par la notif ; **attach‑only** + **allow‑list**.
* **Couple minimal “notify sans session”** : `project` + `to_agent` (**rôle**, pas ID technique) + `provider` + `session_prefix` + `resource.pointer`.
* **Messagerie** : *fil = dossier* ; `version: 1` dans les boîtes agents si utilisées ; `general.yaml` conservé s’il existe.

---

