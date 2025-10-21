# Spécification — Notifications d’intention & Ordres (brique 22)

**Périmètre :** cette version couvre le modèle de notification canal-agnostique, les 3 NT (A2A / Cron / Human), le NT détaillé **A2A** et **Human**, les **ordres** standard (SPEC, ANALYSE, RÉDACTION) **sans paramètres**, ainsi que les ordres **INFO_REQUEST**, **INTERMEDIATE_RESPONSE**, **FINAL_DELIVERY_OWNER**, **ESCALATE_TO_PMO** et **ESCALATE_TO_OWNER**, plus les **règles transverses**.

---

## Étape 1 — Objectif (élargi, non limité à la messagerie)

Créer une **notification d’intention explicite**, canal-agnostique, qui déclenche chez l’agent une chaîne standardisée :

1. **À faire immédiatement**
2. **SYNC/READ** de la **ressource pointée** (message | tâche | artefact | événement | file/queue | webhook)
3. **Exécution** d’**un ou plusieurs ordres** (brique 22)

**Principes clés**

* **Aucune duplication de contenu** : la notification porte **uniquement** `intent.key` et un **pointeur de ressource typé**.
* **Agnostique du substrat** : le pas SYNC/READ sait résoudre la ressource selon son type (inbox, backlog, dépôt d’artefacts, etc.).
* **Déterministe & idempotent** (chemin strict), avec **fallback** sûr si `intent.key` inconnu (ex. `READ_AND_ACK` / `NOOP+ACK`).
* **Gouvernance** : respect des **préconditions** (ARKORE19) et du **routing par capacités** (CAPAMAP01).
* **Traçabilité minimale obligatoire** : `intent_received`, `pointer_resolved`, `actions_run`, **évidences** déposées, **result/handoff** renvoyé.

**Contraintes recommandées** (champ `constraints` dans la notif)

* `NO_TIME` : aucune référence temporelle (dates, heures, délais, estimations).
* `EXECUTE_NOW` : déclenchement immédiat côté agent (sans planification).
* `NOTIFY_SILENT` : exécution sans message chat tant qu’aucun prompt humain n’est reçu.

---

## Étape 2 — Typologie des **Templates de Notification** (NT)

**NT-A2A-MESSAGE_TO_RESULT**

* Déclencheur : Agent → Agent
* Ressource : **message** (pointeur vers l’inbox du destinataire)
* Chaîne : **À faire immédiatement → SYNC/READ (message) → Ordres (1..n) → RESULT + Évidences**
* Ordres typiques : `READ_AND_ACK` → `EXECUTE_DELIVERABLE` → `DELIVERY_SUBMIT`
* Fallback : `READ_AND_ACK` si message incomplet

**NT-CRON-EXEC_WITH_DOC**

* Déclencheur : Cron/planification → Agent
* Ressource : **doc** (procédure, spec, rapport)
* Chaîne : **À faire immédiatement → SYNC/READ (doc) → Ordres → RESULT + Journal périodique**
* Ordres typiques : `APPLY_PROCEDURE` → `GENERATE_REPORT` → `ARCHIVE_CAPTURE`
* Fallback : `ACK + skip` si doc manquant/obsolète

**NT-HUMAN-INLINE_EXEC**

* Déclencheur : Humain → Agent (urgence / recadrage / Q-R simple)
* Ressource : **inline_message** (texte affiché en session) ou note courte référencée
* Chaîne : **À faire immédiatement → Afficher l’inline → Ordres → Réponse visible + Évidences**
* Ordres typiques : `QUICK_ANALYSE` → `QUICK_DECISION` → `MESSAGE_SEND`
* Fallback : bascule vers NT-A2A si complexité > seuil

---

## Étape 3 — Modèle d’un **Template de Notification (NT)** & Assembleur

**Modèle NT (décrit côté configuration)**

* **Identité** : `nt_id`, nom, description
* **Déclencheur** : source (agent | cron | humain | webhook)
* **Ressource pointée** : `{ type: message|doc|inline_message|task|artifact|event, pointer: ref }`
* **Préambule** : règle **SYNC/READ** selon `type`
* **Order set (1..n)** : liste ordonnée d’**ordres** (références brique 22) avec :
  `order_ref`, `condition?`, `mode: serial|parallel`, `retry?`, **évidences attendues**
* **Politiques** : `stop_on_failure` (oui/non), `fallback` (ex. `READ_AND_ACK`), `ack_policy`
* **Sorties** : `result` (`done|failed|needs_info|proposed_next|handoff|escalated`), `evidences`, `handoff?`

**Assembleur de notifications (rôle)**

* **Entrées** : émetteur, destinataire, `resource(type+pointer)`, `intent.key`, contraintes (`NO_TIME`, `EXECUTE_NOW`)
* **Sélection** du **NT** approprié (règles par source/capacité)
* **Sortie** : **notification compacte** : `{ nt_id, intent.key, resource(type+pointer), constraints }`
* **Garanties** : canal-agnostique, préambule obligatoire, idempotence, fallback sûr

---

## Étape 4 — NT détaillés (UI et exécution)

### 4.1 NT-A2A-MESSAGE_TO_RESULT

**Contenu de la notification (strict)**

* `nt_id`: `NT-A2A-MESSAGE_TO_RESULT`
* `from_agent`, `to_agent`
* `resource`: `{ type: "message", pointer: "<message_id>" }`
* `intent.key`: clé d’intention (ex. `EXECUTE_DELIVERABLE`, `ORDER_SPEC`, …)
* `constraints`: `NO_TIME`, éventuellement `EXECUTE_NOW`

**Affichage minimal en session (texte)**

```
Intention : NT-A2A-MESSAGE_TO_RESULT
Ressource : message <message_id>
Étapes : [Lire] → [Exécuter] → [Résultat]
Actions : [Lire] [Exécuter] [Voir evidences]
```

**Exécution standard (déterministe)**

1. **READ** du message (marquage lecture + journal)
2. **Appliquer l’ordre** (ou la séquence d’ordres) référencé(s) par le NT
3. **Envoyer la réponse en messagerie** (ack/result/decision) avec références des **évidences**
4. **Mettre à jour la session** (références uniquement), **après** l’envoi du message

**Fallback** : si `intent.key` inconnu → `READ_AND_ACK`

---

### 4.2 NT-HUMAN-INLINE_EXEC

**Contenu de la notification (strict)**

* `nt_id`: `NT-HUMAN-INLINE_EXEC`
* `from_human`, `to_agent`
* `resource`: `inline_message` (texte exact à afficher)
* `constraints`: `NO_TIME`, `EXECUTE_NOW`

**Affichage minimal en session**

```
Intention : NT-HUMAN-INLINE_EXEC
Message : « …inline… »
Contraintes : NO_TIME, EXECUTE_NOW
Étapes : [Afficher] → [Exécuter] → [Répondre]
Actions : [Exécuter maintenant] [Voir evidences]
```

**Exécution** : afficher l’inline, exécuter l’ordre court, **répondre par message** (puis refléter en session)

---

## Étape 5 — **Ordres** (brique 22) — **zéro paramètre** (tout est dans le message)

> **Format commun attendu du message (body)** : blocs lisibles (ex. `CONTEXTE`, `OBJECTIF`, `EXIGENCES`, `CAS`, `BRIEF`, `CONTRAINTES`, `PIÈCES/LIENS`…), **verbes impératifs**, **séquence numérotée** ou `status:` (conformité ARKORE20).
> **Canal de réponse** : **exclusivement par messagerie** (nouveau message avec `relates_to`).
> **Aucune temporalité** (NO_TIME).

### 5.1 ORDER_SPEC — « Spécification (tout type) »

* **Émetteur (body attendu)** : `CONTEXTE`, `OBJECTIF`, `EXIGENCES` (fonc./non-fonc.), `CONTRAINTES`, `PIÈCES/LIENS` + **séquence impérative**
* **Workflow destinataire** : `READ_AND_ACK` → `SPEC_BUILD` → `SPEC_CHECK` → `DELIVERY_SUBMIT`
* **Évidences** : `spec_path`, `assumptions_log`, `acceptance_criteria`, `consistency_check_report`
* **Résultat** : `done` ou `needs_info` (questions ciblées)
* **Fallback** : `MESSAGE_SEND` (clarifications) / `HANDOFF_TO_AGENT` si besoin

### 5.2 ORDER_ANALYSE — « Analyse / Audit / Bug / Test / QA »

* **Émetteur** : `CAS`, `OBJECTIF` (audit/diagnostic/QA/test), `PIÈCES/LIENS`, `CRITÈRES` (si dispo) + **séquence impérative**
* **Workflow** : `READ_AND_ACK` → `ANALYSE_RUN` → `RECOMMENDATIONS_BUILD` → `DELIVERY_SUBMIT`
* **Évidences** : `analysis_report`, `evidence_pack`, `recommendations_list`, `test_scenarios`
* **Résultat** : `done` ou `needs_info`
* **Fallback** : noyau minimal + questions ; handoff si blocage

### 5.3 ORDER_REDACTION — « Rédaction (tout type) »

* **Émetteur** : `BRIEF`, `TON/STYLE` (optionnel), `GABARIT` (optionnel), `CONTRAINTES`, `PIÈCES/LIENS` + **séquence impérative**
* **Workflow** : `READ_AND_ACK` → `DRAFT_WRITE` → `STYLE_CHECK` → `DELIVERY_SUBMIT`
* **Évidences** : `content_path`, `style_check_log`, `brief_trace`
* **Résultat** : `done` ou `needs_info`
* **Fallback** : gabarit standard / variantes de ton

### 5.4 ORDER_INFO_REQUEST — « Besoin d’infos complémentaires »

* **Émetteur** : `CONTEXTE`, `OBJECTIF`, `EXIGENCES/PIÈCES`, `ZONE D’OMBRE` + **séquence impérative**
* **Workflow** : `READ_AND_ACK` → `MISSING_GAP_LIST` → `QUESTION_BUILD (≤3)` → `MESSAGE_SEND` → `THREAD_MARK_WAITING_INFO`
* **Évidences** : `missing_info_log`, `questions_note`, `request_message_ref`
* **Résultat** : `needs_info`
* **Anti-boucle** : **1 seul envoi** de demande d’infos par thread

### 5.5 ORDER_INTERMEDIATE_RESPONSE — « Réponse intermédiaire & orientation »

* **Émetteur** : `CONTEXTE`, `ACTION EFFECTUÉE`, `ARTEFACTS/LIENS`, `OPTIONS SUIVANTES SOUHAITÉES` + **séquence impérative**
* **Workflow** : `READ_AND_ACK` → `RESULT_SUMMARY_BUILD` → `ARTIFACTS_INDEX` → `NEXT_ACTIONS_PROPOSE` → `MESSAGE_SEND`
* **Évidences** : `result_report`, `artifact_index`, `next_actions_set`
* **Résultat** : `proposed_next` (thread **non clos**)
* **Anti-boucle** : **1 seule** proposition de “next actions” par thread

### 5.6 ORDER_FINAL_DELIVERY_OWNER — « Livraison finale au Owner »

* **Usage** : **fin de chaîne**, prêt à livrer **au Owner**
* **Émetteur** : `CONTEXTE`, `LIVRABLE(S) FINAUX`, `CRITÈRES D’ACCEPTATION ATTEINTS`, `ÉVIDENCES/PAQUET` + **séquence impérative**
* **Workflow** : `READ_AND_ACK` → `DELIVERY_PACKAGE_BUILD` → `DELIVERY_SUBMIT_TO_OWNER` → `THREAD_CLOSE`
* **Évidences** : `delivery_pack_index`, `delivery_message_ref`, `closure_log`
* **Résultat** : `done` + **clôture** du thread

### 5.7 ORDER_ESCALATE_TO_PMO — « Escalade vers PMO »

* **Émetteur** : `CONTEXTE`, `RAISON_ESCALADE`, `IMPACT`, `ATTENTE_PMO`, `PIÈCES/LIENS` + **séquence impérative**
* **Workflow** : `READ_AND_ACK` → `ESCALATION_NOTE_BUILD` → `EVIDENCE_MIN_PACK` → `MESSAGE_SEND (to=PMO)` → `THREAD_MARK_ESCALATED_PMO`
* **Évidences** : `escalation_note`, `evidence_pack_index`, `escalation_message_ref`
* **Anti-boucle** : **1 seule** escalade PMO par thread

### 5.8 ORDER_ESCALATE_TO_OWNER — « Escalade Owner (autorisée PMO/AGP) »

* **Précondition** : émetteur ∈ {**PMO**, **AGP**}, sinon `not_authorized` + handoff PMO
* **Émetteur** : `CONTEXTE`, `RAISON_ESCALADE_OWNER`, `OPTIONS_PROPOSÉES`, `RECOMMANDATION`, `PIÈCES/LIENS` + **séquence impérative**
* **Workflow** : `READ_AND_ACK` → `OWNER_PACKET_BUILD` → `MESSAGE_SEND (to=OWNER, type=decision)` → `THREAD_MARK_WAITING_OWNER`
* **Évidences** : `owner_pack_index`, `owner_message_ref`, `orientation_note`
* **Anti-boucle** : **1 seule** escalade Owner par thread

---

## Étape 6 — Règles générales (transverses)

1. **Canal de réponse unique** : **toutes** les réponses passent par la **messagerie** (nouveau message `ack|result|decision|request` avec `relates_to`).
2. **Session UI** : **rien n’est affiché** tant que le **premier message sortant** n’a pas été écrit. Ensuite, la session reflète **uniquement des références** (liens, ids).
3. **Zéro paramètre d’ordre** : l’ordre lit **uniquement le message** pointé ; la notification ne contient **pas** le corps.
4. **Notification** : `{ nt_id, intent.key, resource(type+pointer), constraints }` — pas de duplication de contenu.
5. **Préambule obligatoire** : toujours **READ** de la ressource avant exécution.
6. **Conformité ARKORE20** :

   * `message_required` conformes ; `actions_expected` **non vide** (impératif + séquence)
   * `execution_protocol: strict` ⇒ `ack_policy: system`
   * pièces jointes référencées avec `sha256`
7. **Contraintes de contenu** : `NO_TIME` ; pas d’agentivité implicite (pas de “surveiller/planifier/attendre”).
8. **Anti-boucle** :

   * 1 × `INFO_REQUEST` / thread
   * 1 × `INTERMEDIATE_RESPONSE` (proposition “next actions”) / thread
   * 1 × `ESCALATE_TO_PMO` et 1 × `ESCALATE_TO_OWNER` / thread
   * divergences ⇒ **handoff PMO** (arbitrage)
9. **Escalades** :

   * vers **PMO** : autorisée pour tout agent
   * vers **Owner** : **PMO** ou **AGP** uniquement
10. **Idempotence** : ignorer doublons de notif ; journal append-only : `intent_received → pointer_resolved → orders_run → message_sent`.

---

**Prêt pour test.**
Si cette spec vous convient, je vous prépare la micro-checklist de validation (cas nominal + 4 cas limites) pour votre essai local, toujours sans code.
