# ARKA SOCLE v0.1-d_beta

Socle modulaire ARKA_LABS. Partie 1 (core) + premières extensions Partie 2 (router avancé, fallback engine, circuit breaker).

## Installation & scripts

```bash
cd ARKA_SOCLE
npm install
npm run build
npm start  # écoute http://localhost:9090
```

Mode dev :
```bash
npm run dev
```

Tests :
```bash
npm test
```

## Modules livrés

- **Core** : Module Manager, Context Sync, Session Orchestrator, MetaEngine, Validation Core, Persistence, LogService.
- **Extensions (Partie 2 – lot 1)** :
  - `adapter_router_advanced` : stratégies de routage (round-robin, least-connections, weighted, sticky-session…), instances dynamiques, cache configurables (TTL, stratégie LRU/LFU/FIFO), file d’attente priorisée et métriques temps réel.
  - `fallback_engine` : chaînes de repli, seuils d’erreur, health-check continus, planification de recovery et historique des tentatives.
  - `circuit_breaker` : état closed/open/half-open, configuration fine (timeouts, seuils), métriques complètes et intégration au fallback engine.

Modules extensions désactivés par défaut (activation via `/api/modules/:id/enable`).

## Endpoints principaux

| Domaine | Routes |
|---------|--------|
| Status | `GET /api/socle/state`, `GET /api/modules/health` |
| Sessions | `POST /api/sessions`, `GET /api/sessions`, `GET /api/sessions/:id`, `DELETE /api/sessions/:id`, `POST /api/sessions/:id/terminal`, `POST /api/sessions/validate` |
| Contexte | `GET /api/context`, `PUT /api/context`, `GET /api/context/version` |
| Meta | `POST /api/meta/files`, `GET /api/meta/files`, `GET /api/meta/search` |
| Config | `GET /api/config`, `PUT /api/config`, `DELETE /api/config`, `POST /api/config/validate` |
| Reporting | `GET /api/reports/state` |
| Diagnostics | `GET /api/diagnostics` |
| Recovery | `GET /api/recovery`, `POST /api/recovery/trigger` |
| Logs | `GET /api/logs`, `GET /api/logs/stream` |
| Router avancé | `GET /api/router`, `POST /api/router/strategy`, `POST /api/router/load-balancing`, `POST /api/router/routing`, `POST /api/router/cache`, `POST /api/router/cache/config`, `POST /api/router/cache/invalidate`, `GET /api/router/cache`, `POST /api/router/queue`, `GET /api/router/queue`, `GET /api/router/queue/:moduleId`, `POST /api/router/queue/prioritize`, `POST /api/router/instances/register`, `POST /api/router/instances/unregister`, `POST /api/router/dispatch`, `GET /api/router/metrics/:moduleId` |
| Fallback | `GET /api/fallback/status`, `POST /api/fallback/register`, `POST /api/fallback/chain`, `POST /api/fallback/remove`, `POST /api/fallback/threshold`, `GET /api/fallback/errors/:moduleId`, `POST /api/fallback/trigger`, `POST /api/fallback/recover`, `POST /api/fallback/recovery/strategy`, `POST /api/fallback/recovery/schedule`, `POST /api/fallback/health/start`, `POST /api/fallback/health/stop`, `POST /api/fallback/health/force` |
| Circuit breaker | `GET /api/circuit/status`, `GET /api/circuit/state/:moduleId`, `GET /api/circuit/config/:moduleId`, `GET /api/circuit/metrics/:moduleId`, `POST /api/circuit/config`, `POST /api/circuit/reset`, `POST /api/circuit/force-reset`, `POST /api/circuit/half-open`, `POST /api/circuit/failure`, `POST /api/circuit/success`, `POST /api/circuit/open`, `POST /api/circuit/close`, `POST /api/circuit/test` |

## Structure

```
ARKA_SOCLE/
├── src/
│   ├── core/
│   ├── services/
│   ├── extensions/
│   ├── http/routes.ts
│   ├── container.ts
│   └── index.ts
├── tests/
├── data/
└── package.json
```

## Intégration CLI

- La CLI (`ARKA_CLI`) consomme directement ces endpoints (voir `docs/cli-socle-validation.md`).
- Script e2e côté CLI : `npm run verify:socle` (SOCLE démarré au préalable).

## Configuration

- `ARKA_SOCLE_PORT` : port HTTP (défaut `9090`).
- `ARKA_SOCLE_BASE` : répertoire racine (stockage `data/`).

## Tests disponibles

- `tests/api.test.ts` : parcours core (sessions, contexte, modules).
- `tests/extensions.test.ts` : router avancé (cache, queue, metrics), fallback engine (health, thresholds) et circuit breaker (config, metrics, test).

## Roadmap suivante

- Lots Partie 2 restants : Load Balancer dédié, Monitoring avancé, Snapshot/Event Replay, Context Isolation, Vector Search, Cloud Adapter, UI Module Manager.
- Ajouter persistance dédiée pour les extensions (config YAML -> JSON), alerting Prometheus, WebSocket logs.
