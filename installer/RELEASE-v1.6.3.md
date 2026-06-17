## Tabernacle ERP Premium v1.6.3 — Correctif API embarquée

**Important :** remplace v1.6.0 à v1.6.2 si l'application affiche l'interface mais refuse la connexion avec « Impossible de joindre l'API ».

### Correctif

- Modules `@tabernacle/erp-premium-db` et `@tabernacle/erp-premium-domain` correctement inclus dans l'installateur (liens workspace)
- L'API embarquée ne dépend plus du dossier de développement sur la machine
- Le fichier `.env` du développeur n'est plus copié dans l'installateur (seul `env.template` est fourni)
- Journaux d'erreur API plus détaillés dans `data\api-embedded-stderr.log`

### Installation

**Option A — Archive portable (recommandée pour v1.6.3)**  
Télécharger `TabernacleERP-Portable-1.6.3.zip`, extraire dans un dossier (ex. `C:\Tabernacle ERP`), lancer `TabernacleERP.exe`.

**Option B — Installateur**  
Si `TabernacleERP-Setup-1.6.3.exe` est disponible sur la release, installez par-dessus une version précédente (données conservées). L'installateur exécute automatiquement la configuration des modules workspace.

**Correctif sur v1.6.2 déjà installée**  
Exécutez en administrateur : `scripts\Fix-WorkspaceLinks.cmd` dans le dossier d'installation, puis relancez l'application.

Si l'erreur persistait, supprimez le fichier `config\.env` de l'installation puis relancez l'application (un nouveau fichier sera créé depuis le modèle).
