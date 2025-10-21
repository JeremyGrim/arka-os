# 📋 Plan de Migration et Standardisation des Agents ARKA_OS

## 🎯 Objectif
Migrer tous les agents vers le standard AGP avec contexte projet centralisé et configuration complète.

## 📊 État Actuel vs État Cible

### Tableau de Synthèse

| Agent | État Actuel | État Cible | Priorité | Actions Requises |
|-------|------------|------------|----------|------------------|
| **AGP** | ✅ Complet | ✅ Maintenir | - | Référence modèle |
| **PMO** | ⚠️ Basic | 🎯 Complet | **P0** | Ajouter contexte, délégation, reporting |
| **Lead Dev** | ⚠️ Basic | 🎯 Complet | **P0** | Ajouter contexte, evidence, métriques |
| **Technical Architect** | ⚠️ Minimal | 🎯 Complet | **P1** | Contexte, ADR, patterns |
| **DevOps Guardian** | ⚠️ Minimal | 🎯 Complet | **P1** | CI/CD config, monitoring |
| **QA Testeur** | ⚠️ Minimal | 🎯 Complet | **P1** | Test strategy, coverage |
| **Archiviste** | ⚠️ Basic | 🎯 Standard | **P2** | Contexte, retention |
| **UX/UI Guardian** | ⚠️ Minimal | 🎯 Standard | **P2** | Design system, parcours |
| **Security Architect** | ⚠️ Minimal | 🎯 Standard | **P2** | Compliance, audit |
| **Market Research** | ⚠️ Minimal | 🎯 Standard | **P3** | Sources, analysis |
| **Mission Qualifier** | ⚠️ Minimal | 🎯 Standard | **P3** | Scoring, grilles |
| **Outreach** | ⚠️ Minimal | 🎯 Standard | **P3** | Templates, A/B |
| **Pipeline Tracker** | ⚠️ Minimal | 🎯 Standard | **P3** | Dashboard, KPIs |
| **Positioning Expert** | ⚠️ Minimal | 🎯 Standard | **P3** | Assets, adaptation |
| **Scribe** | ⚠️ Basic | 🎯 Standard | **P3** | Memory compact |

## 🔄 Phases de Migration

### Phase 1 : Agents Critiques (Semaine 1)

#### 1.1 PMO Orchestrator
```yaml
Actions:
- [ ] Ajouter project_context_ref
- [ ] Configurer delegation rules
- [ ] Définir reporting templates
- [ ] Ajouter metrics tracking
- [ ] Documenter workflows
```

#### 1.2 Lead Dev Bâtisseur
```yaml
Actions:
- [ ] Ajouter project_context_ref
- [ ] Définir evidence requirements
- [ ] Configurer test coverage
- [ ] Ajouter code templates
- [ ] Setup CI/CD hooks
```

### Phase 2 : Agents Techniques (Semaine 2)

#### 2.1 Technical Architect
```yaml
Actions:
- [ ] Ajouter context complet
- [ ] Définir ADR templates
- [ ] Configurer design patterns
- [ ] Ajouter architecture docs refs
```

#### 2.2 DevOps Guardian
```yaml
Actions:
- [ ] Ajouter monitoring config
- [ ] Définir deployment pipelines
- [ ] Configurer alerts & SLAs
- [ ] Ajouter infrastructure as code
```

#### 2.3 QA Testeur
```yaml
Actions:
- [ ] Ajouter test strategies
- [ ] Définir coverage targets
- [ ] Configurer test automation
- [ ] Ajouter bug tracking
```

### Phase 3 : Agents Support (Semaine 3)

#### Tous les autres agents
```yaml
Actions pour chaque:
- [ ] Ajouter project_context_ref minimal
- [ ] Définir available_intents
- [ ] Configurer memory
- [ ] Ajouter persona basique
```

## 📝 Template de Migration

### Pour chaque agent, ajouter :

```yaml
# === SECTION À AJOUTER ===

# 1. Contexte Projet (OBLIGATOIRE)
project_context_ref: ARKAA21-PROJECT-CONTEXT:vars
rules_version_ref: ARKPR20-WAKEUP-POLICIES:exports.rules_version
rules_index_ref: ARKPR20-WAKEUP-POLICIES:exports.rules_index_ref
guardrails_ref: ARKPR20-WAKEUP-POLICIES:exports.guardrails

# 2. Contexte Documentaire
context:
  docs_ref:
    vision_produit: ARKAA21-PROJECT-CONTEXT:vars.docs.vision_produit
    roadmap: ARKAA21-PROJECT-CONTEXT:vars.docs.roadmap
    plan_directeur: ARKAA21-PROJECT-CONTEXT:vars.docs.plan_directeur
  governance_ref: ARKAA21-PROJECT-CONTEXT:vars.governance
  dor_dod_ref: ARKAA21-PROJECT-CONTEXT:vars.dor_dod

# 3. Spécialisations (selon agent)
specializations:
  # Adapter selon le rôle
  ...

# 4. Métriques
metrics:
  track: [...]
  report_to: [pmo, agp]
  frequency: weekly

# 5. Persona Amélioré
persona:
  identity: |
    Description claire du rôle
  do: [...]
  dont: [...]
```

## ✅ Checklist de Validation

### Pour chaque agent migré :

- [ ] **Configuration**
  - [ ] project_context_ref présent
  - [ ] Toutes les refs résolvent
  - [ ] Memory configurée
  - [ ] Intents définis

- [ ] **Documentation**
  - [ ] Expert card complète
  - [ ] Wake-up à jour
  - [ ] README individuel
  - [ ] Exemples d'usage

- [ ] **Tests**
  - [ ] Agent démarre sans erreur
  - [ ] Actions principales fonctionnent
  - [ ] Memory persiste
  - [ ] Events émis correctement

- [ ] **Gouvernance**
  - [ ] Permissions alignées
  - [ ] Evidence pack défini
  - [ ] Reporting configuré
  - [ ] Escalade documentée

## 📈 Métriques de Succès

| Métrique | Baseline | Cible | Mesure |
|----------|----------|-------|--------|
| Agents standardisés | 1/16 (6%) | 16/16 (100%) | Count configs complètes |
| Context refs | 1/16 | 16/16 | grep project_context_ref |
| Documentation | 30% | 100% | README + examples |
| Tests coverage | 0% | 80% | Test files présents |
| Memory active | 50% | 100% | ARKA_META/.system/.mem/{agent}/ exists |

## 🛠️ Scripts d'Aide

### Vérifier les références manquantes
```bash
#!/bin/bash
for wake in ARKA_AGENT/client/acme/wakeup/*.yaml; do
  echo "=== $(basename $wake) ==="
  grep -q "project_context_ref" $wake || echo "❌ Missing project_context_ref"
  grep -q "docs_ref" $wake || echo "❌ Missing docs_ref"
  grep -q "governance_ref" $wake || echo "❌ Missing governance_ref"
done
```

### Générer un squelette de migration
```bash
#!/bin/bash
AGENT=$1
cat > ARKA_AGENT/client/acme/wakeup/ARKAA08-WAKEUP-${AGENT}_v2.yaml << EOF
# Version migrée avec contexte complet
id: ARKAA08-WAKEUP-${AGENT}
version: 2.0.0

# Copier config existante...

# === AJOUTER ===
project_context_ref: ARKAA21-PROJECT-CONTEXT:vars
# ... reste du template
EOF
```

## 🚀 Actions Immédiates

1. **Aujourd'hui**
   - [ ] Valider le plan avec l'équipe
   - [ ] Commencer migration PMO
   - [ ] Tester configuration PMO v2

2. **Cette semaine**
   - [ ] Migrer agents P0 (PMO, Lead Dev)
   - [ ] Documenter les patterns trouvés
   - [ ] Créer tests automatisés

3. **Semaine prochaine**
   - [ ] Migrer agents P1
   - [ ] Créer dashboard monitoring
   - [ ] Formation équipe

## 📚 Documentation à Créer

| Document | Priorité | Responsable |
|----------|----------|-------------|
| Guide Migration Agent | P0 | AGP |
| Template Wake-up v2 | P0 | AGP |
| Best Practices Agents | P1 | PMO |
| Troubleshooting Guide | P1 | DevOps |
| Agents Interaction Map | P2 | Architect |

---

## ✅ Résultat Attendu

Après migration :
- **100% des agents** avec contexte projet
- **Configuration unifiée** et maintenable
- **Documentation complète** pour chaque agent
- **Tests automatisés** pour validation
- **Monitoring actif** des performances

---

*Plan de Migration v1.0 - À exécuter sur 3 semaines*