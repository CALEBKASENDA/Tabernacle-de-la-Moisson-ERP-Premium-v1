# Installeur Windows — Tabernacle de la Moisson ERP

Crée un **installeur `.exe`** (Inno Setup) ou une **archive portable** contenant tout le nécessaire :

- Node.js embarqué (aucune installation Node requise chez l'utilisateur)
- API + interface web compilées
- SQLite / `better-sqlite3` (compilé sur la machine de build)
- Lanceur automatique (démarre le serveur + ouvre le navigateur)

---

## Prérequis (machine de développement)

| Outil | Rôle |
|-------|------|
| **Node.js 22+** et **npm** | Compiler l'application |
| **Inno Setup 6** (recommandé) | Générer `TabernacleERP-Setup-1.0.0.exe` |
| **Windows 10/11 x64** | Build natif (`better-sqlite3`) |

Télécharger Inno Setup : https://jrsoftware.org/isinfo.php

---

## Créer l'installeur

À la racine du projet :

```powershell
npm run installer:win
```

Ou directement :

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File installer/build-windows.ps1
```

**Sortie :**

- `installer/output/TabernacleERP-Setup-1.0.0.exe` — installeur complet
- `installer/staging/` — dossier intermédiaire (ne pas distribuer tel quel)

Sans Inno Setup, une archive **`TabernacleERP-Portable-*.zip`** est créée à la place.

---

## Installation chez l'utilisateur final

1. Lancer `TabernacleERP-Setup-1.0.0.exe`
2. Suivre l'assistant (installation dans `C:\Program Files\Tabernacle de la Moisson ERP`)
3. Cocher « Lancer Tabernacle ERP » à la fin
4. L'application s'ouvre dans le navigateur : **http://127.0.0.1:3847**

**Raccourcis créés :**

- Bureau / Menu Démarrer → **Tabernacle de la Moisson ERP**
- **Arrêter Tabernacle de la Moisson ERP** — stoppe le serveur
- **Modifier la configuration** — ouvre `%LOCALAPPDATA%\Tabernacle ERP\.env`
- **Ouvrir le dossier de données** — base SQLite

---

## Données et configuration

| Élément | Emplacement |
|---------|-------------|
| Base SQLite | `%LOCALAPPDATA%\Tabernacle ERP\data\tabernacle-finance.sqlite` |
| Configuration | `%LOCALAPPDATA%\Tabernacle ERP\.env` |
| Logs | `%LOCALAPPDATA%\Tabernacle ERP\tabernacle.log` |

Au **premier lancement**, le fichier `.env` est créé depuis le modèle. Modifiez-y le compte admin :

```env
TABERNACLE_BOOTSTRAP_EMAIL=votre@email.com
TABERNACLE_BOOTSTRAP_PASSWORD=VotreMotDePasse
TABERNACLE_BOOTSTRAP_NAME=Votre Nom
```

Puis redémarrez l'application (Arrêter → Relancer).

---

## Démarrage automatique Windows

Lors de l'installation, cochez **« Démarrer Tabernacle ERP au lancement de Windows »** pour ajouter un raccourci dans le dossier Démarrage.

---

## Désinstallation

Panneau de configuration → Programmes → **Tabernacle de la Moisson ERP**.

Les **données** (`%LOCALAPPDATA%\Tabernacle ERP`) sont **conservées** par défaut (sauvegardez-les avant désinstallation si besoin).

---

## Options avancées du build

```powershell
# Ne pas recompiler (staging déjà prêt)
.\installer\build-windows.ps1 -SkipBuild

# Archive ZIP uniquement (sans Inno Setup)
.\installer\build-windows.ps1 -PortableOnly
```

---

## Dépannage

| Problème | Solution |
|----------|----------|
| « Le serveur n'a pas démarré » | Consultez `%LOCALAPPDATA%\Tabernacle ERP\tabernacle.log` |
| Port 3847 occupé | Menu Démarrer → Arrêter Tabernacle de la Moisson ERP |
| Page blanche | Vérifier que `app\apps\desktop\dist\index.html` existe dans l'installation |
| Erreur `better-sqlite3` | Recompiler l'installeur **sur Windows** (pas depuis Linux/WSL) |
