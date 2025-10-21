# Plan ARKA CLI – Partie 1

## Objectifs fonctionnels

1. Couvrir les 11 commandes coeur (init, status, sessions create/list/inspect/logs/end, context show/push/pull, file inject/list/search, config get/set/reset, validate, report, recovery, diagnostics, logs).
2. Sécuriser l'intégration avec le SOCLE via l'API REST décrite dans ARKA03 Partie 1.
3. Fournir un socle de tests (unitaires + intégration) et un script e2e (
pm run verify:socle).

## Architecture CLI

- src/cli.ts : câblage Commander
- src/client/socle-client.ts : client HTTP (axios + retry)
- src/commands/* : handlers par domaine
- src/utils/* : resolver, formatter, logger
- 	ests/ : unitaires & intégration (Vitest)
- scripts/verify-socle.js : vérification e2e contre SOCLE réel

## Matrice commande ? endpoint

| Commande | Endpoint SOCLE |
|----------|----------------|
| rka init | POST /api/socle/init |
| rka status | GET /api/socle/state, GET /api/modules/health |
| rka session create | POST /api/sessions |
| rka session list | GET /api/sessions |
| rka session inspect | GET /api/sessions/:id |
| rka session logs | GET /api/logs, GET /api/logs/stream |
| rka session end | DELETE /api/sessions/:id |
| rka file inject | POST /api/meta/files |
| rka file list | GET /api/meta/files |
| rka meta search | GET /api/meta/search |
| rka context show | GET /api/context |
| rka context push | PUT /api/context |
| rka context pull | GET /api/context, GET /api/context/version |
| rka config get/set/reset | GET /api/config, PUT /api/config, DELETE /api/config |
| rka validate | POST /api/config/validate |
| rka report | GET /api/reports/state |
| rka diagnostics | GET /api/diagnostics |
| rka recovery status/trigger | GET /api/recovery, POST /api/recovery/trigger |
| rka logs | GET /api/logs, GET /api/logs/stream |

## Validation

- 
pm test : unités + intégration via mocks
- 
pm run verify:socle : validation CLI ? SOCLE réel (nécessite ../ARKA_SOCLE en cours d'exécution)
- Checklist manuelle : docs/cli-socle-validation.md

## Priorités Partie 2 (non livrées)

- UX enrichie (spinners, auto-complete, IPC Desktop)
- Gestion mémoire avancée / vectorisation MetaEngine
- Tests E2E complets en environnement distribué
