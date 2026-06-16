## Tabernacle ERP Premium v1.6.1 — Correctif démarrage

**Important :** remplace v1.6.0 si l'application se fermait immédiatement sans afficher l'interface.

### Correctif

- API embarquée incomplète dans l'installateur v1.6.0 (`appFactory.js` manquant)
- Préparation des ressources Tauri corrigée (copie complète de `apps/api/dist`)
- Journal de démarrage : `data\tauri-boot.log` et `data\api-embedded-stderr.log` en cas d'erreur

### Installation

Télécharger `TabernacleERP-Setup-1.6.1.exe` et installer par-dessus v1.6.0 (données conservées).
