# ARKA_EXT — Packs d'extensions

## Convention
- Placez vos abonnements dans `ARKA_EXT/ARKAEXT{ID}-{SHORTNAME}.yaml` (racine du dépôt).
- Chaque pack doit exposer les champs `id`, `version`, `title`, `isolation: true` et une section `override:`.
- Activez-les via `profiles/<profil>.override.yaml`.
- Les scripts locaux vivent dans `scripts/handlers/` (chemin attendu par le bus d'événements).
- Ne modifiez pas `ARKA_CORE/` ; utilisez les overrides.

## Validation
- `npm run validate` vérifie que tous les handlers référencés existent et sont exécutables.