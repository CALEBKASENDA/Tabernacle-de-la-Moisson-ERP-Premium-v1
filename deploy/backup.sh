#!/usr/bin/env bash
set -euo pipefail

# Sauvegarde SQLite depuis le volume Docker
# Usage : bash deploy/backup.sh [dossier_destination]

BACKUP_DIR="${1:-./backups}"
STAMP="$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP_DIR"

docker compose exec -T app sh -c 'test -f /data/tabernacle-finance.sqlite && cat /data/tabernacle-finance.sqlite' \
  > "$BACKUP_DIR/tabernacle-finance-$STAMP.sqlite"

echo "Sauvegarde : $BACKUP_DIR/tabernacle-finance-$STAMP.sqlite"
