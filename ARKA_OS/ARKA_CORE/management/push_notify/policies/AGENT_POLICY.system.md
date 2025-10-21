# AGENT POLICY — Système (mise à jour)

- **Silence chat obligatoire** après une notification.
- Toute réponse attendue est un **fichier STATUS ou RESULT** (append-only) avec `relates_to`.
- **Aucun ACK** produit par un LLM (ACK = transport système).
- **Sessions Option A** : attach_only + allow-list, pas de création.
