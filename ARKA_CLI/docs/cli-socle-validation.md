# Validation CLI ? SOCLE (Partie 1)

Cette checklist permet de v�rifier le branchement de la CLI sur une instance locale du SOCLE v0.1-d_beta.

## Pr�requis

1. Compiler et d�marrer le SOCLE dans un terminal s�par� :
   ```bash
   cd ../ARKA_SOCLE
   npm install
   npm run build
   npm start
   # �coute sur http://localhost:9090 par d�faut
   ```

2. Compiler la CLI :
   ```bash
   cd ../ARKA_CLI
   npm install
   npm run build
   ```

## V�rification assist�e

Ex�cuter le script automatis� (attend que le SOCLE soit up) :

```bash
npm run verify:socle
```

Le script encha�ne :
- `arka status --json`
- `arka session create �`
- `arka session list --json`
- `arka context push` / `context show`
- `arka file inject` / `file list --json`
- `arka report --json`
- `arka diagnostics --json`
- `arka session end`

Il �choue si la r�ponse SOCLE est inattendue.

## Parcours manuel recommand�

1. **Statut SOCLE**
   ```bash
   arka status --json
   ```
   V�rifier `socle.status === "ready"` et la pr�sence des modules `arka_core`, `arka_os`, `arka_cli`, `arka_meta`.

2. **Sessions**
   ```bash
   arka session create --agent agp --profile governance --provider claude --terminal 1
   arka session list --json
   arka session inspect <ID>
   arka session logs <ID> --tail --level info
   arka session end <ID>
   ```

3. **Contexte**
   ```bash
   arka context push --file ./context.yaml
   arka context show
   arka context pull --format yaml --output ./.ARKA_LABS/context.snapshot.yaml
   ```

4. **Meta / Fichiers**
   ```bash
   arka file inject ./fixtures/sample.txt --session <ID> --tags validation
   arka file list --session <ID> --json
   arka meta search validation
   ```

5. **Configuration & Gouvernance**
   ```bash
   arka config set socle.environment staging
   arka config get --json
   arka validate --json
   arka report --json
   arka diagnostics --json
   ```

6. **Recovery**
   ```bash
   arka recovery status --json
   arka recovery trigger --module arka_cli
   ```

Chaque commande doit se terminer sans erreur et renvoyer un payload coh�rent.

7. **Extensions Résilience (optionnel)**
   ```bash
   curl -X POST http://localhost:9090/api/router/strategy \
     -H "Content-Type: application/json" \
     -d '{"moduleId":"router_test","strategy":"weighted","targets":["router_test","router_backup"],"weights":{"router_test":1,"router_backup":2}}'

   curl http://localhost:9090/api/router/metrics/router_test

   curl -X POST http://localhost:9090/api/fallback/health/start \
     -H "Content-Type: application/json" \
     -d '{"moduleId":"router_test","config":{"interval":1000,"timeout":500,"retries":1,"failureThreshold":1,"successThreshold":1}}'

   curl -X POST http://localhost:9090/api/circuit/failure \
     -H "Content-Type: application/json" \
     -d '{"moduleId":"router_test","reason":"manual-check"}'
   ```
   Vérifier les retours JSON (`/api/router`, `/api/fallback/status`, `/api/circuit/status`) pour confirmer le bon câblage des modules Partie 2.

## Nettoyage

- Arr�ter le SOCLE (`Ctrl+C`).
- Supprimer les dossiers `.ARKA_LABS` et `data/` temporaires si n�cessaire.

