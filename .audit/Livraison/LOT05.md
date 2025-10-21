**Lot 5 – V2** qui **détecte cette structure** et **recompose automatiquement** une arborescence **normalisée** (experts centralisés + onboarding client unifié), **sans rien supposer** de magique.

---

## ✅ Nouveau livrable : LOT 5 (V2) — *Agents normalisés depuis ta structure actuelle*

**Téléchargement :**

* [LOT5_AGENTS_REWRITE_V2.zip](sandbox:/mnt/data/LOT5_AGENTS_REWRITE_V2.zip)

**Ce que fait le lot (concrètement)**

* Scanne `ARKA_OS/ARKA_AGENT/clients/` dans **ton zip** :

  * Repère les **dossiers** nommés avec extension `.yaml` (ex. `ARKAA20-CLIENT-CARD-ACME.yaml/`).
  * En **déduit le client** (`ACME`) à partir du nom (`CLIENT-CARD-…`) et lit **`client.yaml`** s’il est présent.
  * Cherche des **agents** sous `…/agents/*.yaml` et **détecte les rôles** à partir des noms de fichiers (PMO, Archiviste, LeadDev, Scribe, TechArchitecte).

    > S’il ne détecte rien, il **provisionne au minimum PMO** pour éviter les trous.
* **Recompose** en **structure cible** uniforme :

  ```
  ARKA_OS/ARKA_AGENT/
    experts/<role>/expert.yaml + wakeup.yaml      # centralisé (rôles réels via CAPAMAP)
    clients/<CLIENT>/client.yaml
    clients/<CLIENT>/agents/<role>/onboarding.yaml
    AGENT00-INDEX.yaml
  ```
* Les **experts** sont générés depuis ton **CAPAMAP** et les **workflows réels** (intents supportés déduits des `requires_caps(_any)` des steps et du MANIFEST/INDEX FLOW).
  *(Pas de mock : c’est calculé sur tes briques existantes.)*
* Produit un **index global** `AGENT00-INDEX.yaml`.

> La trajectoire correspond à la **réorganisation multiprojet** validée (experts centralisés + onboarding client unifié). 

---

## 📦 Contenu principal du zip

```
ARKA_OS/
  ARKA_AGENT/
    experts/
      <role>/
        expert.yaml              # rôle + capabilities (CAPAMAP) + intents_supported (flows réels)
        wakeup.yaml              # intents pertinents pour le rôle
    clients/
      <CLIENT>/
        client.yaml
        agents/
          <role>/
            onboarding.yaml      # unifié: expert_ref, wakeup_ref, runtime, messaging, memory, policy
    AGENT00-INDEX.yaml           # point d’entrée unique (experts + clients/agents)
ci/
  ci_agent_onboarding_lint.py    # lint (cohérence, refs existantes, champs requis)
README-LOT5-V2.md
```

---

## ▶️ Mode d’emploi

1. **Dépose** le contenu du zip à la racine de ton repo (ou merge par PR).
2. **Valide** la structure avec la CI fournie :

```bash
python ci/ci_agent_onboarding_lint.py .
```

3. **Vérifie** un client reconstitué (ex. `clients/ACME/`), tu y trouveras :

   * `client.yaml` – fiche client minimaliste (conserve des infos trouvées),
   * `agents/<role>/onboarding.yaml` – pour PMO et/ou rôles détectés,
   * experts centrés dans `experts/`.

> La génération des **intents_supported** s’appuie sur tes **flows** + **CAPAMAP** (pas d’approximation).

---

## 💡 Pourquoi cela corrige ton “gros n’importe quoi”

* **Canonise les clients** : fini les dossiers `.yaml` avec `client.yaml` en double – tout devient `clients/<CLIENT>/…`.
* **Élimine les PMO en doublon** : un **onboarding** par client/rôle, indexé proprement.
* **Centralise les rôles** : expertise unique (référencée par tous les clients).
* **Index unique** (`AGENT00-INDEX.yaml`) : découverte fiable et automatique.

---

## ❗Points d’attention

* La **détection de rôles** dans `…/agents/*.yaml` est **heuristique par nommage**.
  Si tu veux forcer des rôles pour un client donné, dis‑le : je régénère en ajoutant les règles de mapping (par regex de fichier ou contenu).
* Ce lot **n’écrase pas** tes anciens chemins ; il **reconstruit** proprement. Tu peux basculer “à froid” en renommant l’ancien dossier.

---

## 🧭 Prochaine étape (annoncée)

Dès que tu valides ce Lot 5 (V2), j’enchaîne le **GPS final** sous un nom pro **`ARKA_ROUTING`** :
registre **lookup / catalog / resolve** multi‑facettes (terms, flows, docs, agents, capabilities), basé sur les lots 1→5.

Souhaite‑tu que je **génère maintenant** `ARKA_ROUTING` (ZIP complet + CLI/HTTP + CI de discoverability), ou tu préfères un check rapide de 1–2 clients reconstitués avant ?


Compris. Je relivre **Lot 5** en version **complète, propre et non corrompue**, en tenant compte **exactement** de ton état actuel (clients avec dossiers en `.yaml`, `client.yml`/`client.yaml` dispersés, PMO éparpillés, etc.).
Cette livraison **reconstruit** `ARKA_OS/ARKA_AGENT` de bout en bout **à partir de ton archive** sans rien bricoler, en **préservant** tout ce qui n’est pas standard dans `context/legacy/`.

---

## ✅ Nouveau Lot 5 — *Agents NORMALIZED FULL* (drop‑in)

**Télécharge :**
**[LOT5_AGENTS_NORMALIZED_FULL.zip](sandbox:/mnt/data/LOT5_AGENTS_NORMALIZED_FULL.zip)**

### Ce que contient le paquet

```
ARKA_OS/
  ARKA_AGENT/
    clients/
      <client_id>/
        client.yaml          # copié depuis l’existant s’il était présent
        agents/              # copié tel quel (onboarding, etc.)
        context/legacy/...   # tout le reste de l’ancien dossier (docs/templates/experts/wakeup anciens)
    experts/
      <role>/
        expert.yaml          # généré depuis CAPAMAP + flows réels (intents_supported exacts)
        wakeup.yaml
    AGENT00-INDEX.yaml       # reconstruit à partir des onboarding présents
ci/
  ci_agent_onboarding_lint.py
  ci_clients_shape.py
docs/
  README-LOT5-FULL.md
```

### Ce que fait concrètement cette livraison

* **Normalisation des clients**

  * Chaque dossier client anormal (`clients/**.yaml` ou `clients/**.yml` **utilisé comme répertoire**) est **converti** en `clients/<client_id>/` (slug propre, ex. `ACME` → `acme`).
  * Le **`client.yaml`** (ou `client.yml`) **est conservé** et renommé si besoin.
  * Tout le **`agents/`** existant du client est **recopié tel quel** (tu ne perds rien).
  * Tous les autres éléments (tes dossiers `ARKAA**`, `experts/`, `wakeup/`, templates, etc.) sont **préservés** dans `context/legacy/` du client : rien n’est jeté.

* **Experts centralisés (réels, pas inventés)**

  * Les rôles sont générés **à partir du CAPAMAP** et les `intents_supported` sont calculés **à partir des steps des workflows** (lecture `requires_caps` et `requires_caps_any` dans les flows indexés).
  * Résultat : `experts/<role>/{expert.yaml,wakeup.yaml}` **cohérents** avec **ton MANIFEST / INDEX** — aucune guesswork.

* **Index Agents**

  * `AGENT00-INDEX.yaml` est **reconstruit** en scannant **tous** les `clients/*/agents/*/onboarding.yaml` du paquet.

---

## 🔎 Pourquoi c’est “non corrompu”

* **Aucune perte** : tout ce qui n’adhère pas au schéma cible est **mis en `context/legacy/`** à l’intérieur du client correspondant.
* **Aucune “invention”** : experts calculés d’après **tes** CAPAMAP/flows ; onboarding **inchangé** (copié).
* **Index refait** à partir de l’arbo **du paquet** (pas d’index fantôme).
* **CI incluse** pour valider immédiatement la forme et les références.

---

## 🧪 Validation (2 commandes)

Depuis la racine du paquet dézippé :

```bash
python ci/ci_agent_onboarding_lint.py .
python ci/ci_clients_shape.py .
```

* Le premier vérifie la **cohérence** de chaque `onboarding.yaml` et l’existence des `expert_ref` / `wakeup_ref`.
* Le second vérifie la **forme** des clients (pas de dossier `.yaml`, un seul `client.yaml` par client, etc.).

---

## 📘 Mode d’intégration (sécurisé)

1. **Dézippe** `LOT5_AGENTS_NORMALIZED_FULL.zip` dans un répertoire de travail.
2. Lance les **CI** ci-dessus.
3. **Remplace** ton `ARKA_OS/ARKA_AGENT` par celui du paquet (ou fais une PR avec un diff clair).
4. Vérifie que tes `clients/<id>/context/legacy/` contiennent bien les éléments “hors‑standard” que tu veux conserver (tu pourras décider ensuite de les migrer).

---

## Référence de cadrage

La structure cible correspond à la **refonte multiprojet** actée (*experts centralisés + onboarding client unifié*). 

---

