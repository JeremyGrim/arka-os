# ARKA_AGENT — Contexte client / intégrations (couche finale)

> Cette couche **n'override jamais les règles** de CORE. Elle 
> 1) choisit un **profil** (droits/limites), 2) apporte le **contexte client** (secteur, vocabulaire,
>    contraintes), 3) branche les **templates** et **intégrations** (Event Bus).

Build final (ex.) :
```bash
yq ea '. as $i ireduce ({}; . * $i )' AGENT00-INDEX.yaml master-agent.yaml client/acme/*.yaml > build/assembly.yaml
```
Runner : `node bin/runner.mjs --core ../ARKA_CORE/build/core.assembly.yaml --profil ../ARKA_PROFIL/build/profiles.bundle.yaml --agent ./build/assembly.yaml --as-agent lead-dev-batisseur ...`
