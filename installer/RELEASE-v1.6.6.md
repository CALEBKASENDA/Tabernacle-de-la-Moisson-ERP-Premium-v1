## Tabernacle ERP Premium v1.6.6 — API joignable (correctif transport)

### Correctif principal

- **« Impossible de joindre l'API »** : le frontend détecte correctement le mode Tauri (`tauri.localhost`) et utilise le pont IPC au lieu d'un `fetch` HTTP impossible
- **`withGlobalTauri`** : expose `window.__TAURI__` pour les appels `api_request`
- **Chemins d'installation** : `config/` et `data/` résolus à côté de `TabernacleERP.exe` (pas dans `resources/`)
- **Mode legacy (Edge)** : l'API s'initialise avant d'écouter le port 3847 ; le lanceur attend le statut `ok`

### Connexion

1. Installez `TabernacleERP-Setup-1.6.6.exe`
2. Relancez Tabernacle depuis le menu Démarrer
3. Connectez-vous avec le courriel/mot de passe de `config\.env`
4. Mettez `TABERNACLE_BOOTSTRAP_RESET=false` après la première connexion réussie

### Dépannage

- Logs Tauri : `data\tauri-boot.log`, `data\api-embedded-stderr.log`
- Mode legacy : `config\logs\tabernacle-error.log`
- Santé API legacy : `http://127.0.0.1:3847/health`
