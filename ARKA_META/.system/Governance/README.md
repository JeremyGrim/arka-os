# ARKA_META/.system/Governance

Répertoire canonique (runtime) pour la gouvernance ARKA_OS.

## Objectifs
- Historiser les ordres (ORD), comptes rendus (CR), revues et décisions Gate.
- Centraliser les evidence packs (hash commits, chemins sources, horodatages).
- Servir de point unique pour les audits Core Guardians (Owner, Core Archiviste, Core Scribe).

## Arborescence
- `orders/` : ordres validés (YAML/MD).
- `docs/` : plans, procédures, référentiels Core Guardians.
- `logs/` : journaux append-only (audits, optimisations, décisions).
- `projets/` : dossiers PRJ-* (specs, lots, rapports).
- `bins/` : scripts runtime (cron, msg).
- `Owner/` : optimisations et directives Owner/Core Guardians.

## Règles
- Append-only : toute modification requiert validation explicite Owner.
- Nommer chaque fichier avec un identifiant unique (`ORD-XXXX`, `CR-XXXX`, `AUDIT-YYYYMMDD`).
- Associer chaque entrée à un evidence pack (commit hash, sources) et l’inscrire dans `logs/` et `INDEX-SCRIBE`.
