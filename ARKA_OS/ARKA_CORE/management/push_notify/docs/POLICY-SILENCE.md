
# POLICY — Silence & continuité (LD / équipe)

**Objectif :** empêcher les blocages quand l'Owner ne répond pas.  
**Principe :** *le silence n'est pas un signal de pause* — continuer jusqu'au prochain jalon.

## Contraintes (constraints) recommandées
- `CONTINUE_ON_SILENCE` — poursuivre l'exécution sans attendre un retour.
- `NO_ACK_REQUIRED` — ne pas exiger d'ACK Owner.
- `KEEP_CHAIN_ACTIVE` — ne pas basculer en `inactive` après un message sortant.
- `STATUS_EVERY:15m` — limiter les messages de statut à 1/15 minutes.
- `NOTIFY_SILENT` — traiter la tâche **sans message chat** lorsque l'ordre provient du bus notify.
- `metadata.silent: true` — indicateur runtime pour les adapters / policies (injecté automatiquement si `NOTIFY_SILENT` présent).

## Boucle de décision (agent)
1. Recevoir la notif (brique 22), **lire** le message pointé.
2. Si `actions_expected` présent → exécuter l'action correspondante.
3. Sinon → `READ_AND_ACK` (interne), puis **proposer** `NEXT_ACTIONS` et **continuer** (pas d'attente Owner).
4. Reporter un **statut** seulement à un jalon ou toutes `STATUS_EVERY`.

## Exemple d'envoi Owner → LD
```powershell
pwsh -File .\bin\Send-ArkaPush.ps1 `
  -Project 'arka-labs-b' -Agent 'LD' `
  -ResourcePointer 'arkamsg://inbox/LD' `
  -Constraints 'NO_TIME','EXECUTE_NOW','NOTIFY_SILENT','CONTINUE_ON_SILENCE','NO_ACK_REQUIRED','KEEP_CHAIN_ACTIVE','STATUS_EVERY:15m' `
  -FromAgent 'owner'
```

## Anti-boucle
Si le contenu prévu du message est déjà "Je continue...", **ne pas renvoyer** la même promesse :  
générer une **note d'étape** (delta concret) ou **rien** (attendre un jalon).
