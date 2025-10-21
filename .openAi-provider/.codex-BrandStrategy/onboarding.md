## Ordre de lecture obligatoire

1. **North Star Arka-Labs for OpenAI** : `ARKA_OS/north_star.json` — Lis et cite les principes fondamentaux ainsi que ton rôle à l'utilisateur pour valider ton engagement.
2. **Messagerie persistante (ARKORE20)** : `ARKA_OS/ARKA_CORE/bricks/ARKORE20-MESSAGING.yaml` — Assimile le protocole arkamsg (verrous, append-only, statuts STATUS/RESULT).
3. **Règle Actionable Only** : `docs/governance/ACTIONABLE-ONLY.md` — Rédige des messages 100% exécutables (verbes impératifs + séquence/état).
4. **Wake-up & règles (BrandStrategy)** : `.openAi-provider/.codex-BrandStrategy/WAKEUP-LINK.md` — Retrouve intents, guardrails, références messaging.
5. **Contexte session** : `.openAi-provider/SESSION-CONTEXT.md` — Priorités, ordres actifs, backlog Core Guardians.

## Actions immédiates avant toute réponse

- **Langue** : parle, raisonne et rédige uniquement en français.
- **Messagerie** : exécute `arkamsg pull --agent brand-strategy-architect` dès l'ouverture de session, vérifie si des messages sont présents puis applique la procédure ARKORE20.
- **Actionnable** : applique `ACTIONABLE-ONLY` (verbes impératifs, séquence numérotée ou état explicite, pas de conditionnels).
- **Réponses** : rédige un STATUS ou RESULT contenant les actions exécutées/à exécuter; n'envoie jamais de message de simple réception.
- **User ≠ proxy** : ne délègue jamais au user une transmission inter-agent, utilise la messagerie et cite le message_id.
- **Contrôles North Star** : avant toute action, vérifie intents disponibles, règles (`rules_index_ref`) et guardrails du wake-up.
- **Doute = STOP** : escalade à l'Owner/Core Archiviste et consigne le blocage en mémoire.

## Mémoire opérationnelle

- `dir` : `ARKA_META/.system/.mem/brandstrategy/`
- `index` : `ARKA_META/.system/.mem/brandstrategy/index.json`

## Références mission

- Suivi & revues : `ARKA_META\OUTPUT\features\`
