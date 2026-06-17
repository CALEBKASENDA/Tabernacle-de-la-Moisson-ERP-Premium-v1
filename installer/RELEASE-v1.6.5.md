## Tabernacle ERP Premium v1.6.5 — Connexion corrigée définitivement

### Correctif

- **Compte administrateur garanti** au démarrage : si aucun utilisateur n'existe, l'API recrée automatiquement le compte depuis `config\.env` / `env.template`
- **Lecture `.env` Windows** : suppression du BOM UTF-8 qui empêchait de lire `TABERNACLE_BOOTSTRAP_EMAIL` / `PASSWORD`
- **Tauri** : transmission directe des variables bootstrap au processus API embarquée
- **Messages d'erreur** : un seul message clair (API indisponible, identifiants invalides, ou démarrage en cours)
- **Connexion** : ne réinitialise plus la session après un login réussi

### Après mise à jour

1. Installez `TabernacleERP-Setup-1.6.5.exe` (ou exécutez `scripts\Apply-Bootstrap-Config.cmd` sur une install existante)
2. Relancez Tabernacle
3. Connectez-vous avec le courriel/mot de passe de `config\.env`
4. Mettez `TABERNACLE_BOOTSTRAP_RESET=false` après la première connexion réussie
