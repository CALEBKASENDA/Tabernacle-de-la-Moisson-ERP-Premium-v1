## Tabernacle ERP Premium v1.6.3 — Correctif API embarquée

**Important :** remplace v1.6.0 à v1.6.2 si l'application affiche l'interface mais refuse la connexion avec « Impossible de joindre l'API ».

### Correctif

- Modules `@tabernacle/erp-premium-db` et `@tabernacle/erp-premium-domain` correctement inclus dans l'installateur (liens workspace)
- L'API embarquée ne dépend plus du dossier de développement sur la machine
- Le fichier `.env` du développeur n'est plus copié dans l'installateur (seul `env.template` est fourni)
- Journaux d'erreur API plus détaillés dans `data\api-embedded-stderr.log`

### Installation

Télécharger `TabernacleERP-Setup-1.6.3.exe` et installer par-dessus une version précédente (données conservées).

Si l'erreur persistait, supprimez le fichier `config\.env` de l'installation puis relancez l'application (un nouveau fichier sera créé depuis le modèle).
