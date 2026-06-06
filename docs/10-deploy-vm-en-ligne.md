# Déploiement VM en ligne (accès mondial 24/7)

> **Guide utilisateur :** voir [deploy/README.md](../deploy/README.md) pour le tutoriel complet pas à pas.

Ce document complète le README de déploiement avec des détails techniques.

## Architecture

```
Internet → VM (ports 80/443) → Caddy (HTTPS) → API Node + interface React
                                      ↓
                              Volume Docker /data (SQLite)
```

Un seul conteneur `app` sert :
- l'API REST (`/api/v1/...`)
- l'interface web (fichiers React compilés)

## Prérequis

| Élément | Recommandation |
|---------|----------------|
| VM | Ubuntu 22.04+ (1 vCPU, 2 Go RAM minimum) |
| Fournisseurs | Hetzner, DigitalOcean, OVH, AWS EC2, Azure, Google Cloud |
| Domaine | `erp.votre-eglise.org` pointant vers l'IP publique de la VM |
| Ports ouverts | 22 (SSH), 80, 443 |

## Déploiement rapide (Ubuntu)

```bash
# Sur la VM, après git clone ou copie du projet
sudo bash deploy/install-vm.sh
```

Puis éditez `.env` à la racine :

```env
DOMAIN=erp.votre-domaine.com
ACME_EMAIL=admin@votre-domaine.com
TABERNACLE_CHURCH_NAME=Tabernacle de la Moisson
```

Relancez :

```bash
docker compose --profile production up -d
```

Ouvrez **https://erp.votre-domaine.com** — identifiants admin créés au premier démarrage.

## Commandes utiles

```bash
# Construire l'image
docker compose build

# Production HTTPS (recommandé)
docker compose --profile production up -d

# Accès direct port 3847 (tests, sans domaine)
docker compose --profile direct up -d app-direct

# Logs
docker compose logs -f app

# Mise à jour après modification du code
git pull
docker compose build
docker compose --profile production up -d

# Sauvegarde base SQLite
bash deploy/backup.sh
```

## Variables d'environnement

| Variable | Description |
|----------|-------------|
| `DOMAIN` | Nom de domaine public |
| `ACME_EMAIL` | E-mail Let's Encrypt |
| `TABERNACLE_DATA_DIR` | Dossier données (dans Docker : `/data`) |
| `TABERNACLE_CHURCH_ID` | Identifiant église par défaut |
| `TABERNACLE_CHURCH_NAME` | Nom affiché |
| `PORT` / `HOST` | Écoute API (défaut `3847` / `0.0.0.0`) |

## Sécurité en production

1. **Changez le mot de passe admin** dès la première connexion (écran Sécurité).
2. **Sauvegardes automatiques** : planifiez `deploy/backup.sh` via cron (ex. chaque nuit).
3. **Pare-feu** : seuls SSH, 80 et 443 doivent être ouverts.
4. **HTTPS** : Caddy renouvelle automatiquement les certificats Let's Encrypt.

## Sans nom de domaine (test)

```bash
docker compose --profile direct up -d app-direct
```

Accès : `http://IP_PUBLIQUE_VM:3847`

## Dépannage

| Problème | Solution |
|----------|----------|
| Certificat HTTPS échoue | Vérifiez que le DNS pointe vers la VM et que le port 80 est ouvert |
| Page blanche | `docker compose logs app` — vérifier `WEB_DIST_DIR` |
| Données perdues | Les données sont dans le volume `tabernacle_data` — ne pas supprimer ce volume |

## Coût indicatif

- VM modeste : ~5–10 €/mois (Hetzner CX22, DO Basic)
- Domaine : ~10 €/an
- Certificat SSL : gratuit (Let's Encrypt)
