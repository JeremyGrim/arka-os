# ARKA CLI – Partie 1 (v1.0.0-core)

Interface en ligne de commande pour piloter ARKA_LABS : initialisation du SOCLE, orchestration des sessions multi-agents, gestion des fichiers/meta, configuration et diagnostics.

## 1. Installation rapide

`ash
npm install      # dépendances CLI
npm run build    # génère dist/main.js
npm link         # optionnel, rendre rka global
`

## 2. Branchement sur le SOCLE local

1. Démarrer le SOCLE Partie?1 :
   `ash
   cd ../ARKA_SOCLE
   npm install
   npm run build
   npm start   # http://localhost:9090 par défaut
   `
2. Revenir côté CLI, compiler si nécessaire puis lancer la vérification automatisée :
   `ash
   cd ../ARKA_CLI
   npm run build
   npm run verify:socle
   `
   Le script enchaîne statut, création de session, push contexte, injection de fichier, report/diagnostics puis nettoyage. Il échoue si une réponse REST est inattendue.
3. Parcours manuel détaillé : voir docs/cli-socle-validation.md.

## 3. Commandes disponibles (Partie 1)

| Commande CLI | Description | Endpoint SOCLE |
|--------------|-------------|----------------|
| rka init | Prépare .ARKA_LABS/ et recharge les modules | POST /api/socle/init |
| rka status [--json] | Statut SOCLE + modules | GET /api/socle/state, GET /api/modules/health |
| rka validate [--json] | Validation gouvernance | POST /api/config/validate |
| rka report [--json] | Export état SOCLE | GET /api/reports/state |
| rka diagnostics [--json] | Diagnostic santé | GET /api/diagnostics |
| rka session create | Crée une session agent | POST /api/sessions |
| rka session list [--json] | Liste les sessions | GET /api/sessions |
| rka session inspect [--json] | Détail d’une session | GET /api/sessions/:id |
| rka session logs [--tail] | Logs session | GET /api/logs, GET /api/logs/stream |
| rka session end <id> | Stoppe la session | DELETE /api/sessions/:id |
| rka file inject | Injecte un fichier ARKA_META | POST /api/meta/files |
| rka file list [--json] | Liste les fichiers | GET /api/meta/files |
| rka meta search | Recherche par tags | GET /api/meta/search |
| rka context show | Affiche le contexte | GET /api/context |
| rka context push | Pousse un contexte JSON/YAML | PUT /api/context |
| rka context pull | Exporte le contexte | GET /api/context, GET /api/context/version |
| rka config get/set/reset | Gestion configuration | GET /api/config, PUT /api/config, DELETE /api/config |
| rka recovery status/trigger | Suivi / déclenchement recovery | GET /api/recovery, POST /api/recovery/trigger |
| rka logs | Logs système | GET /api/logs, GET /api/logs/stream |

## 4. Options utiles

- --json disponible sur la plupart des commandes pour un output machine-friendly.
- --session, --level, --tail sur les commandes de logs.
- --file, --format pour rka context push/pull (YAML ou JSON).

## 5. Développement & tests

`ash
npm run build         # compilation TypeScript
npm run dev           # watch
npm test              # tests unitaires + intégration functorisés
npm run verify:socle  # e2e CLI ? SOCLE (SOCLE doit tourner)
`

Tests couverts :
- Résolution de session, injection fichier, init (	ests/unit/...).
- Parcours session/meta via mocks (	ests/integration/...).
- Vérification e2e : 
pm run verify:socle aligne la CLI sur le SOCLE réel.

## 6. Points de vigilance

- La CLI vise http://localhost:9090 par défaut (ARKA_SOCLE_URL pour surcharger).
- rka session create valide le wakeup via /api/sessions/validate avant de créer.
- rka file inject refuse les sessions inexistantes (résolution via API).

## 7. Roadmap Partie?2 (non livrée)

- UX enrichie (spinners, auto-complete, IPC Desktop).
- Gestion mémoire avancée, vectorisation MetaEngine.
- Test E2E complet en environnement distribué.

---

- docs/cli-socle-validation.md : checklist de validation manuelle.
- docs/plan-cli.md : rappel des objectifs et scope Partie?1.
