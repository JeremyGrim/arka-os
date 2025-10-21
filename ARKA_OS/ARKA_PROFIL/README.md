# ARKA_PROFIL — Moteur des profils (droits / chemins / limites / catalogues)

> Définit **qui peut faire quoi et où** (sets d'actions, sets de chemins, bundles de droits,
> limites/ratelimits) **sans toucher aux règles** d'ARKA_CORE. ARKA_AGENT choisit un
> `profile` (rights + limits) et ajoute **contexte/templates/events**.

**Build**
```bash
yq ea '. as $i ireduce ({}; . * $i )' PROFILES00-INDEX.yaml master-profiles.yaml bricks/*.yaml > build/profiles.bundle.yaml
```

**Interfaces**
- Référence **ARKORE12** (liste des `action_keys`) et **ARKORE08** (globs/chemins) **en lecture seule**.
- Fournit à ARKA_AGENT : `action_sets`, `path_sets/deny_sets`, `rights`, `limits`, `policy`, `profiles`.
