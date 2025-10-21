# LOT5 Agents — Normalisation V2

Cette version prend en compte ta structure actuelle dans `clients/` **où des dossiers portent une extension `.yaml`**
(ex. `ARKAA20-CLIENT-CARD-ACME.yaml/` contenant `client.yaml` et `agents/`).

Le lot **détecte** ces dossiers, **déduit** l'identifiant client (`ACME`) et **recompose** automatiquement
une arborescence normalisée sous:

```
ARKA_OS/ARKA_AGENT/clients/<CLIENT>/client.yaml
ARKA_OS/ARKA_AGENT/clients/<CLIENT>/agents/<role>/onboarding.yaml
```

Les **experts** sont centralisés dans `experts/<role>/`.

Un index `AGENT00-INDEX.yaml` est généré. Lancer la CI:

```
python ci/ci_agent_onboarding_lint.py .
```

La détection des rôles par client est heuristique (lecture de `clients/<...>.yaml/agents/*.yaml`).
À défaut, le rôle **PMO** est toujours provisionné.
