# DOCTOR — Option A (session manquante)

Objectif: vérifier BLOCK + retour expéditeur + escalade PMO/Owner, sans création de session.

Étapes:
1. Injecter un événement notify v1 visant une session **non autorisée**.
2. Attendre `failed` (missing_session).
3. Vérifier les messages « retour expéditeur » et « escalade ».
4. Contrôler l’absence de session nouvelle (`tmux ls`).

PASS: tous les points validés.
