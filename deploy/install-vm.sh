#!/usr/bin/env bash
set -euo pipefail

# Installation Docker + démarrage Tabernacle ERP sur Ubuntu/Debian
# Usage : sudo bash deploy/install-vm.sh

if [ "$(id -u)" -ne 0 ]; then
  echo "Exécutez ce script avec sudo."
  exit 1
fi

apt-get update
apt-get install -y ca-certificates curl gnupg ufw

if ! command -v docker >/dev/null 2>&1; then
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg
  echo \
    "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
    $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
fi

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_DIR"

if [ ! -f .env ]; then
  cp .env.example .env 2>/dev/null || cp deploy/.env.example .env
  echo "Fichier .env créé — configurez DOMAIN, ACME_EMAIL et TABERNACLE_BOOTSTRAP_* avant production."
fi

ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

docker compose build
docker compose --profile production up -d

BACKUP_CRON="0 2 * * * cd $PROJECT_DIR && bash deploy/backup.sh /var/backups/tabernacle >> /var/log/tabernacle-backup.log 2>&1"
mkdir -p /var/backups/tabernacle
( crontab -l 2>/dev/null | grep -v 'tabernacle-backup' ; echo "$BACKUP_CRON" ) | crontab -

echo ""
echo "Déploiement lancé."
echo "1. Pointez le DNS de votre domaine vers l'IP publique de cette VM."
echo "2. Vérifiez DOMAIN et TABERNACLE_BOOTSTRAP_* dans .env"
echo "3. Ouvrez https://votre-domaine dans le navigateur."
echo "4. Sauvegarde automatique planifiée à 2h (cron)."
