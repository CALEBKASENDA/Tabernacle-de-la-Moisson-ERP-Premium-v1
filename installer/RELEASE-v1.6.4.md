## Tabernacle ERP Premium v1.6.4 — Compte administrateur à l'installation

### Correctif

- Le modèle `config\env.template` définit le compte administrateur principal de l'organisation
- Nouveau script post-install `apply-bootstrap-config.ps1` : crée ou met à jour `config\.env` et synchronise le mot de passe au premier démarrage
- Raccourci de maintenance : `scripts\Apply-Bootstrap-Config.cmd` (réparation sur installation existante)
- Suppression du chemin `TABERNACLE_DATA_DIR` de développement s'il était présent dans une ancienne configuration

### Installation

Installez `TabernacleERP-Setup-1.6.4.exe` ou extrayez `TabernacleERP-Portable-1.6.4.zip`, puis connectez-vous avec le courriel et le mot de passe définis dans `config\env.template`.

Après la première connexion réussie, mettez `TABERNACLE_BOOTSTRAP_RESET=false` dans `config\.env`.

### Mise à jour depuis v1.6.3

Exécutez `scripts\Apply-Bootstrap-Config.cmd` dans le dossier d'installation (ou réinstallez), puis relancez Tabernacle ERP.
