# ARKA CLI � Partie 1 (v1.0.0-core)

Interface en ligne de commande pour piloter ARKA_LABS : initialisation du SOCLE, orchestration des sessions multi-agents, gestion des fichiers/meta, configuration et diagnostics.

## 1. Installation rapide

`ash
npm install      # d�pendances CLI
npm run build    # g�n�re dist/main.js
npm link         # optionnel, rendre rka global
`

## 2. Branchement sur le SOCLE local

1. D�marrer le SOCLE Partie?1 :
   `ash
   cd ../ARKA_SOCLE
   npm install
   npm run build
   npm start   # http://localhost:9090 par d�faut
   `
2. Revenir c�t� CLI, compiler si n�cessaire puis lancer la v�rification automatis�e :
   `ash
   cd ../ARKA_CLI
   npm run build
   npm run verify:socle
   `
   Le script encha�ne statut, cr�ation de session, push contexte, injection de fichier, report/diagnostics puis nettoyage. Il �choue si une r�ponse REST est inattendue.
3. Parcours manuel d�taill� : voir docs/cli-socle-validation.md.

## 3. Commandes disponibles (Partie 1)

| Commande CLI | Description | Endpoint SOCLE |
|--------------|-------------|----------------|
| rka init | Pr�pare .ARKA_LABS/ et recharge les modules | POST /api/socle/init |
| rka status [--json] | Statut SOCLE + modules | GET /api/socle/state, GET /api/modules/health |
| rka validate [--json] | Validation gouvernance | POST /api/config/validate |
| rka report [--json] | Export �tat SOCLE | GET /api/reports/state |
| rka diagnostics [--json] | Diagnostic sant� | GET /api/diagnostics |
| rka session create | Cr�e une session agent | POST /api/sessions |
| rka session list [--json] | Liste les sessions | GET /api/sessions |
| rka session inspect [--json] | D�tail d�une session | GET /api/sessions/:id |
| rka session logs [--tail] | Logs session | GET /api/logs, GET /api/logs/stream |
| rka session end <id> | Stoppe la session | DELETE /api/sessions/:id |
| rka file inject | Injecte un fichier ARKA_META | POST /api/meta/files |
| rka file list [--json] | Liste les fichiers | GET /api/meta/files |
| rka meta search | Recherche par tags | GET /api/meta/search |
| rka context show | Affiche le contexte | GET /api/context |
| rka context push | Pousse un contexte JSON/YAML | PUT /api/context |
| rka context pull | Exporte le contexte | GET /api/context, GET /api/context/version |
| rka config get/set/reset | Gestion configuration | GET /api/config, PUT /api/config, DELETE /api/config |
| rka recovery status/trigger | Suivi / d�clenchement recovery | GET /api/recovery, POST /api/recovery/trigger |
| rka logs | Logs syst�me | GET /api/logs, GET /api/logs/stream |

## 4. Options utiles

- --json disponible sur la plupart des commandes pour un output machine-friendly.
- --session, --level, --tail sur les commandes de logs.
- --file, --format pour rka context push/pull (YAML ou JSON).

## 5. D�veloppement & tests

`ash
npm run build         # compilation TypeScript
npm run dev           # watch
npm test              # tests unitaires + int�gration functoris�s
npm run verify:socle  # e2e CLI ? SOCLE (SOCLE doit tourner)
`

Tests couverts :
- R�solution de session, injection fichier, init (	ests/unit/...).
- Parcours session/meta via mocks (	ests/integration/...).
- V�rification e2e : 
pm run verify:socle aligne la CLI sur le SOCLE r�el.

## 6. Points de vigilance

- La CLI vise http://localhost:9090 par d�faut (ARKA_SOCLE_URL pour surcharger).
- rka session create valide le wakeup via /api/sessions/validate avant de cr�er.
- rka file inject refuse les sessions inexistantes (r�solution via API).

## 7. Roadmap Partie?2 (non livr�e)

- UX enrichie (spinners, auto-complete, IPC Desktop).
- Gestion m�moire avanc�e, vectorisation MetaEngine.
- Test E2E complet en environnement distribu�.

---

- docs/cli-socle-validation.md : checklist de validation manuelle.
- docs/plan-cli.md : rappel des objectifs et scope Partie?1.
