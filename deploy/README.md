# Déploiement VM en ligne — Tabernacle ERP

Hébergez l'ERP sur une **machine virtuelle** pour un accès **permanent depuis n'importe où dans le monde**, via navigateur web et HTTPS sécurisé.

---

## Ce que vous obtenez

| Fonctionnalité | Détail |
|----------------|--------|
| Accès 24/7 | L'application tourne en continu sur la VM |
| HTTPS automatique | Certificat SSL gratuit (Let's Encrypt via Caddy) |
| Interface web | Même écran que en local, sans installation côté utilisateur |
| API intégrée | `/api/v1/...` servie par le même serveur |
| Données persistantes | Base SQLite conservée dans un volume Docker |

---

## Architecture

```
Navigateur (monde entier)
        │
        ▼
   VM — ports 80 / 443
        │
   Caddy (HTTPS)
        │
   Conteneur « app »
   ├── API Node (Fastify)
   └── Interface React (build statique)
        │
   Volume Docker /data
   └── tabernacle-finance.sqlite
```

---

## Prérequis

### Matériel cloud

| Élément | Minimum recommandé |
|---------|-------------------|
| OS | Ubuntu 22.04 ou 24.04 |
| CPU | 1 vCPU |
| RAM | 2 Go |
| Disque | 20 Go |
| Fournisseurs | Hetzner, DigitalOcean, OVH, AWS, Azure, Google Cloud |

### Réseau

- Une **adresse IP publique** fixe sur la VM
- Un **nom de domaine** (ex. `erp.tabernacle-moisson.org`) pointant vers cette IP
- Ports ouverts : **22** (SSH), **80** (HTTP), **443** (HTTPS)

### Logiciel sur la VM

- Docker + Docker Compose (installés automatiquement par le script `install-vm.sh`)

---

## Installation pas à pas

### 1. Créer la VM

Créez une instance Ubuntu chez votre hébergeur. Notez l'**IP publique**.

### 2. Configurer le DNS

Chez votre registrar (OVH, Cloudflare, etc.), ajoutez un enregistrement **A** :

```
erp.votre-domaine.com  →  123.45.67.89
```

Attendez la propagation DNS (quelques minutes à 24 h).

### 3. Copier le projet sur la VM

```bash
ssh root@123.45.67.89

git clone <url-de-votre-depot> tabernacle-erp
cd tabernacle-erp
```

*(Ou transférez le dossier du projet via `scp` / SFTP.)*

### 4. Configurer les variables

```bash
cp .env.example .env
# ou : cp deploy/.env.example .env
nano .env
```

Exemple :

```env
DOMAIN=erp.votre-domaine.com
ACME_EMAIL=admin@votre-domaine.com
TABERNACLE_CHURCH_NAME=Tabernacle de la Moisson
TABERNACLE_BOOTSTRAP_EMAIL=admin@votre-domaine.com
TABERNACLE_BOOTSTRAP_PASSWORD=ChangezMoi-Tres-Fort-2026!
TABERNACLE_BOOTSTRAP_NAME=Administrateur
```

> **Important :** en production, `TABERNACLE_BOOTSTRAP_*` est **obligatoire** pour créer le premier compte admin. Sans ces variables, aucun utilisateur n'est créé au démarrage.

### 5. Lancer l'installation

```bash
sudo bash deploy/install-vm.sh
```

Ce script installe Docker, configure le pare-feu et démarre l'application en mode production.

### 6. Vérifier

Ouvrez dans un navigateur :

**https://erp.votre-domaine.com**

Connectez-vous avec le compte défini dans `TABERNACLE_BOOTSTRAP_EMAIL` / `TABERNACLE_BOOTSTRAP_PASSWORD`, puis **changez immédiatement le mot de passe** (menu Sécurité).

---

## Commandes quotidiennes

Toutes les commandes se lancent **à la racine du projet** sur la VM.

```bash
# Démarrer (production HTTPS)
docker compose --profile production up -d

# Arrêter
docker compose down

# Voir les logs en direct
docker compose logs -f app

# Reconstruire après mise à jour du code
git pull
docker compose build
docker compose --profile production up -d

# Vérifier l'état des conteneurs
docker compose ps
```

---

## Mode test sans domaine

Si vous n'avez pas encore de nom de domaine, utilisez l'IP publique directement :

```bash
docker compose --profile direct up -d app-direct
```

Accès : **http://IP_PUBLIQUE:3847**

> Pas de HTTPS dans ce mode. À utiliser uniquement pour des tests.

---

## Sauvegardes

### Sauvegarde manuelle

```bash
bash deploy/backup.sh
```

Le fichier est enregistré dans `./backups/tabernacle-finance-YYYYMMDD-HHMMSS.sqlite`.

### Sauvegarde automatique (cron)

Le script `install-vm.sh` configure déjà une sauvegarde quotidienne à **2 h** dans `/var/backups/tabernacle`.

Pour modifier ou ajouter manuellement :

```bash
crontab -e
```

```cron
0 2 * * * cd /chemin/vers/tabernacle-erp && bash deploy/backup.sh /var/backups/tabernacle
```

### Restaurer une sauvegarde

```bash
docker compose down
docker run --rm -v tabernacle-erp_tabernacle_data:/data -v $(pwd)/backups:/backup alpine \
  sh -c 'cp /backup/tabernacle-finance-XXXX.sqlite /data/tabernacle-finance.sqlite'
docker compose --profile production up -d
```

---

## Variables d'environnement

| Variable | Obligatoire | Description | Défaut |
|----------|-------------|-------------|--------|
| `DOMAIN` | Oui (HTTPS) | Nom de domaine public | `localhost` |
| `ACME_EMAIL` | Recommandé | E-mail pour Let's Encrypt | — |
| `TABERNACLE_CHURCH_ID` | Non | Identifiant église par défaut | `church_default` |
| `TABERNACLE_CHURCH_NAME` | Non | Nom affiché de l'église | `Tabernacle de la Moisson` |
| `TABERNACLE_BOOTSTRAP_EMAIL` | **Oui (prod)** | E-mail du compte admin initial | — |
| `TABERNACLE_BOOTSTRAP_PASSWORD` | **Oui (prod)** | Mot de passe admin initial | — |
| `TABERNACLE_BOOTSTRAP_NAME` | Non | Nom affiché de l'admin | `Administrateur` |
| `APP_PORT` | Non | Port exposé en mode `direct` | `3847` |

Les données sont stockées dans le volume Docker `tabernacle_data` (chemin interne `/data`).

---

## Sécurité en production

1. **Mot de passe fort** — changez le mot de passe admin dès la première connexion.
2. **HTTPS uniquement** — utilisez le profil `production`, pas `direct`, en usage réel.
3. **Pare-feu** — seuls SSH (22), HTTP (80) et HTTPS (443) doivent être accessibles.
4. **Sauvegardes régulières** — planifiez `backup.sh` via cron.
5. **Mises à jour** — appliquez les mises à jour Ubuntu et reconstruisez l'image Docker après chaque évolution du code.

---

## Dépannage

| Symptôme | Cause probable | Action |
|----------|----------------|--------|
| Certificat HTTPS invalide | DNS pas encore propagé | Vérifiez l'enregistrement A, attendez, relancez Caddy |
| « Serveur API indisponible » | Conteneur `app` arrêté | `docker compose logs app` puis `docker compose --profile production up -d` |
| Page blanche | Build web manquant | `docker compose build --no-cache` puis redémarrer |
| Données disparues | Volume supprimé | Restaurez depuis `./backups/` |
| Port 443 bloqué | Pare-feu hébergeur | Ouvrez 80 et 443 dans le panneau cloud + `ufw` |

Vérifier la santé de l'API :

```bash
curl -s http://localhost:3847/health
# → {"status":"ok","service":"tabernacle-finance-api"}
```

---

## Coût estimé

| Poste | Prix indicatif |
|-------|----------------|
| VM (Hetzner CX22, DO Basic…) | 5 – 10 € / mois |
| Nom de domaine | ~10 € / an |
| Certificat SSL | Gratuit (Let's Encrypt) |

---

## Fichiers de ce dossier

| Fichier | Rôle |
|---------|------|
| `.env.example` | Modèle de configuration |
| `Caddyfile` | Configuration HTTPS (reverse proxy) |
| `install-vm.sh` | Installation automatique sur Ubuntu |
| `backup.sh` | Sauvegarde de la base SQLite |

---

## Support technique

- Documentation architecture : [`docs/10-deploy-vm-en-ligne.md`](../docs/10-deploy-vm-en-ligne.md)
- README principal du projet : [`README.md`](../README.md)
