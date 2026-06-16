## Tabernacle ERP Premium v1.6.2 — Correctif démarrage Windows

**Important :** remplace v1.6.0 et v1.6.1 si l'application se fermait immédiatement sans afficher l'interface.

### Correctif

- Résolution des chemins Windows corrigée (`resource_dir` + dossier `resources\` Inno Setup)
- `executable_dir()` Tauri n'existe pas sous Windows — remplacé par le dossier de l'exécutable
- Chemins Node normalisés (préfixe `\\?\` supprimé) pour l'API embarquée
- Message d'erreur Windows au lieu d'un crash silencieux

### Installation

Télécharger `TabernacleERP-Setup-1.6.2.exe` et installer par-dessus une version précédente (données conservées).
