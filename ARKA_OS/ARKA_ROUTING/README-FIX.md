# ARKA_ROUTING (fix)
- Par défaut, la CLI utilise **le dossier du script** comme racine (`--routing-dir` facultatif).
- Si `bricks/ARKAROUTING-03-CONFIG.yaml` n’indique pas `paths.os_root`, le script **auto‑détecte** `ARKA_OS` en
  remontant à partir de `ARKA_OS/ARKA_ROUTING` ou du sibling `../ARKA_OS`.
- Commandes typiques (depuis la racine du repo) :
  ```
  python ARKA_OS/ARKA_ROUTING/arkarouting.py catalog --facet flow
  python ARKA_OS/ARKA_ROUTING/arkarouting.py resolve --term "AUDIT:RGPD" --client ACME
  ```
