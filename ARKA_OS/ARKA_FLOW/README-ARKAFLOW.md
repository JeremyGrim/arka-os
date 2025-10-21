# arkaflow.py — résolveur/CLI

## Où le placer
Déposez `arkaflow.py` dans `ARKA_FLOW/` côté repo. Le CLI travaille avec :
- `ARKA_FLOW/router/routing.yaml`
- `ARKA_FLOW/ARKFLOW00-INDEX.yaml`
- `ARKA_FLOW/bricks/*.yaml` (workflows, CAPAMAP, RULES, ACTION-KEYS, PRECONDITIONS)

## Commandes
- `resolve` : intent/tags/subject ➜ `flow_ref (ID:EXPORT)`
- `load`    : charge un export (liste les steps)
- `assign`  : sélectionne l'acteur d'un step (capabilities)
- `whereami`: position d'un step dans le flow
- `emit-notify`: fabrique une notify v1 initiale (simulation)

## Pattern recommandé
- **Producteur de notify** (daemon Intake/Dispatcher, PMO, portail) appelle `resolve` puis `emit-notify` pour la 1ʳᵉ étape.
- **Agent ciblé** lit la notify, vérifie `metadata.flow_ref` et `metadata.step`, puis consigne sa sortie dans le **thread**. Le daemon relance ensuite la **prochaine étape** (séquence déclarée).
