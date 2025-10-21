Cette arborescence contient les fiches YAML des agents spécialisés utilisés par Arka.
Chaque fichier est nommé selon le format `ARKA_AGENTXX-nom.yaml` et décrit le rôle,
les responsabilités, les règles comportementales et les workflows associés à
l’agent. Ces fichiers proviennent des spécifications d’origine et servent
d’index pour le PMO et les autres orchestrateurs afin de comprendre les
missions de chaque profil.

Pour ajouter un nouvel agent, créez un fichier YAML dans ce dossier en
respectant la nomenclature `ARKA_AGENT{id}-{nom}.yaml` et décrivez son rôle
selon le modèle existant. Ensuite, ajoutez un fichier wakeup correspondant
dans `client/acme/wakeup` et référencez le nouveau profil dans le
catalogue des profils (`ARKPR08-PROFILES-CATALOG`) si nécessaire.