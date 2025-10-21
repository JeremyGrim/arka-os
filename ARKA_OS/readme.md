# ARKA_OS - Orchestrateur d'Équipes Multi-LLM

![Version](https://img.shields.io/badge/version-2.0.0-blue)
![Status](https://img.shields.io/badge/status-Pre--Beta-orange)
![License](https://img.shields.io/badge/license-MIT-green)

> **🚀 Microsoft Project pour équipes d'IA** - Orchestrez des agents LLM spécialisés avec gouvernance stricte et traçabilité complète.

## 🎯 Pourquoi ARKA_OS ?

### Le Problème
- **Sans ARKA :** Un LLM avec 1000 lignes de prompt → dérive, confusion, mock APIs partout
- **Avec ARKA :** Un LLM avec 5 lignes → expert focalisé qui fait exactement son job

### La Solution
ARKA transforme une constitution complexe en **clés d'action simples** pour orchestrer des équipes d'agents spécialisés avec validation croisée.

## ⚡ Démarrage Rapide

### Prérequis
- **Node.js 18+**
- **Git**
- **Ruby 3+**
- **PowerShell 7+** (Windows) ou **Bash** (Linux/macOS)

### Installation (30 secondes)

```bash
# 1. Cloner le dépôt
git clone https://github.com/votre-org/ARKA_OS.git
cd ARKA_OS

# 2. Builder les bundles
bash bin/os-build.sh    # Linux/macOS
# ou
pwsh bin/os-build.ps1   # Windows

# 3. Tester avec une User Story
bash bin/os-run.sh lead-dev-batisseur US_CREATE '{
  "featureId":"FEAT-01",
  "epicId":"EPIC-01",
  "usId":"US-01",
  "title":"Premier test",
  "kebab_title":"premier-test"
}'
```

## 🏗️ Architecture

```
ARKA_OS/
├── 🔐 ARKA_CORE/      # Moteur de gouvernance (READ-ONLY)
│   ├── bricks/        # 16 briques constitutionnelles
│   ├── scripts/       # Handlers d'événements
│   └── build/         # Bundles générés
│
├── 🛡️ ARKA_PROFIL/    # Gestion des droits (READ-ONLY)
│   ├── bricks/        # 8 briques de permissions
│   └── build/         # Bundles de profils
│
└── 🎨 ARKA_AGENT/     # Configuration client (CUSTOMIZABLE)
    ├── client/acme/   # Client exemple
    ├── wakeup/        # Configurations agents
    └── experts/       # Définitions des rôles
```

## 🤖 Agents Disponibles

| Agent | Spécialité | Provider | Use Case |
|-------|------------|----------|----------|
| **AGP** | Gouvernance & ADR | GPT-5/Codex | Validation, gates, architecture decisions |
| **PMO** | Orchestration | Claude | Planning, coordination, reporting |
| **Lead Dev** | Développement | Claude/Opus | Code, tests, implémentation |
| **Technical Architect** | Architecture | GPT-4 | Design patterns, structure, ADR |
| **DevOps Guardian** | Infrastructure | - | CI/CD, monitoring, deployment |
| **QA Testeur** | Qualité | - | Tests, bugs, validation |
| **UX/UI Guardian** | Design | - | Interfaces, expérience utilisateur |
| **Security Architect** | Sécurité | - | Compliance, audit, protection |
| **Market Research** | Veille | Gemini | Analyse marché, sourcing |
| **Archiviste** | Documentation | - | Traçabilité, mémoire, archives |
| **+ 4 autres** | Spécialisés | Mixte | Mission Qualifier, Outreach, etc. |

## 🎮 Actions Disponibles (96 au total)

### Actions Principales

```yaml
# Structure Projet (32 actions)
FEATURE_*  : CREATE, READ, UPDATE, DELETE, MOVE, RENAME, ARCHIVE, STATUS
EPIC_*     : CREATE, READ, UPDATE, DELETE, MOVE, RENAME, ARCHIVE, STATUS  
US_*       : CREATE, READ, UPDATE, DELETE, MOVE, RENAME, ARCHIVE, STATUS
TICKET_*   : CREATE, READ, UPDATE, DELETE, MOVE, RENAME, ARCHIVE, STATUS, CLOSE

# Livrables (45 actions)
DOCUMENT_* : CREATE, READ, UPDATE, DELETE, MOVE, RENAME, ARCHIVE, STATUS, PUBLISH
REPORT_*   : CREATE, READ, UPDATE, DELETE, MOVE, RENAME, ARCHIVE, STATUS, PUBLISH
ANALYSIS_* : CREATE, READ, UPDATE, DELETE, MOVE, RENAME, ARCHIVE, STATUS, PUBLISH
PLAN_*     : CREATE, READ, UPDATE, DELETE, MOVE, RENAME, ARCHIVE, STATUS, PUBLISH
CONTRACT_* : CREATE, READ, UPDATE, DELETE, MOVE, RENAME, ARCHIVE, STATUS, PUBLISH

# Gouvernance (12 actions)
ORDER_*    : CREATE, READ, UPDATE, DELETE, ASSIGN, VALIDATE, CANCEL, ESCALATE
GATE_*     : NOTIFY, BROADCAST
DECISION_* : PUBLISH, ARCHIVE

# Support (7 actions)
DELIVERY_SUBMIT, MISSION_INGEST, VALIDATE_NAMING, ARCHIVE_CAPTURE,
WORKFLOW_PLAN, REVIEW_DELIVERABLE
```

## 🔧 Configuration

### 1. Créer un Agent (Nouveau Format Compact)

```yaml
# ARKA_AGENT/client/acme/experts/mon-agent.yaml
name: mon-agent-specialise
role: "Expert domaine X"
model: claude-3-opus

# Permissions simplifiées (format ARKPR09)
permissions:
  - "document:*"      # Tout sur documents
  - "report:cr"       # Create/Read sur reports
  - "ticket:cru"      # Create/Read/Update sur tickets
  - "-delete"         # Jamais de delete

capabilities:
  do: ["analyser", "recommander", "valider"]
  dont: ["coder", "décider seul"]
```

### 2. Configurer le Wake-up

```yaml
# ARKA_AGENT/client/acme/wakeup/ARKAA08-WAKEUP-MON_AGENT.yaml
id: ARKAA08-WAKEUP-MON_AGENT
agent_id: mon-agent-specialise
use_profile_ref: ARKPR08-PROFILES-CATALOG:profiles.mon-agent
memory:
  dir: ARKA_META/.system/.mem/mon-agent/
  index: ARKA_META/.system/.mem/mon-agent/index.json
available_intents:
  - DOCUMENT_CREATE
  - REPORT_CREATE
  - REVIEW_DELIVERABLE
```

## 📊 Système de Mémoire

### Structure
```
ARKA_META/.system/.mem/
├── {agent}/
│   ├── log/
│   │   └── YYYY-MM-DD.jsonl    # Logs journaliers
│   └── index.json               # Index pour accès rapide
```

### Opérations
- **MEMORY_UPDATE** : Automatique après chaque action
- **MISSION_INGEST** : Enregistrement des missions
- **READ_CONTEXT** : Lecture des N derniers enregistrements

## 🔄 Event Bus

### Topics Disponibles
```yaml
# Création
FEATURE_CREATED, EPIC_CREATED, US_CREATED, TICKET_CREATED, TICKET_CLOSED

# Livraison & Contrôle  
DELIVERY_RECEIVED, AGP_ACK_SENT, CONTROL_EVALUATED, 
MISSION_RETURN_ISSUED, OWNER_CONFIRMATION_REQUESTED

# Système
MEMORY_UPDATED, MISSION_INGESTED, STATE_CHANGED, 
GATE_PASSED, GATE_REJECTED, ESCALATION_RAISED
```

### Brancher un Script

```yaml
# ARKA_EXT/ARKAEXT01-CUSTOM.yaml
override:
  ARKORE16-EVENT-BUS:
    subscriptions:
      - on: US_CREATED
        using: local
        run: "mon-script.js"
      - on: DELIVERY_RECEIVED
        using: webhook
        run: "${SLACK_WEBHOOK}"
```

## 🧪 Tests

```bash
# Tests unitaires des actions
npm test

# Test de contrats (refs, invariants)
node ARKA_CORE/tests/contracts/arkore12-actions.mjs

# Test d'intégration complet
bash tests/integration/full-flow.sh

# Test de charge
npm run test:load
```

## 📈 Métriques & Monitoring

| Métrique | Cible | Actuel |
|----------|-------|--------|
| TTFT (Time To First Token) | < 2s | ✅ 1.8s |
| Throughput | 15 msg/min | ✅ 18 msg/min |
| Memory footprint | < 500MB | ✅ 320MB |
| Actions disponibles | 96 | ✅ 96 |
| Agents configurés | 14+ | ✅ 14 |
| Couverture tests | > 80% | ⚠️ 65% |

## 🗺️ Roadmap

### v0.1 Beta (En cours)
- [x] Architecture 3 couches
- [x] 96 actions CRUD complètes
- [x] 14 agents configurés
- [x] Event Bus extensible
- [x] Mémoire persistante
- [ ] Interface UI unifiée
- [ ] Tests > 80%
- [ ] Documentation complète

### v0.2 Alpha (Q2 2025)
- [ ] Profile Builder UI (B30)
- [ ] ML local pour prédictions
- [ ] Wake-up System intelligent
- [ ] Multi-projets simultanés

### v0.3 Private Beta (Q3 2025)
- [ ] Multi-utilisateurs
- [ ] Rings de déploiement
- [ ] Rollback instantané
- [ ] Zero-downtime migration

### v1.0 Commercial (Q4 2025)
- [ ] SaaS multi-tenant
- [ ] Marketplace d'agents
- [ ] API publique
- [ ] Support entreprise

## 🤝 Contribution

Voir [CONTRIBUTING.md](docs/CONTRIBUTING.md) pour les guidelines.

### Structure de Commit
```bash
feat(ARKORE12): add NEW_ACTION support
fix(ARKORE16): resolve event dispatch issue  
docs(README): update installation steps
test(integration): add end-to-end scenarios
```

## 📝 Licence

MIT - Voir [LICENSE](LICENSE)

## 🆘 Support

- **Documentation** : [docs/](docs/)
- **Issues** : [GitHub Issues](https://github.com/votre-org/ARKA_OS/issues)
- **Contact** : support@arka-labs.com

## 🙏 Remerciements

Construit avec ❤️ pour révolutionner l'orchestration d'équipes LLM.

---

**[🚀 Commencer](docs/QUICKSTART.md)** | **[📖 Guide Complet](docs/GUIDE.md)** | **[🔧 API Reference](docs/API.md)** | **[💡 Exemples](examples/)**