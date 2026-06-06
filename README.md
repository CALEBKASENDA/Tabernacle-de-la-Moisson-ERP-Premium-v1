# Tabernacle de la Moisson ERP Premium

ERP professionnel multi-églises, **Desktop First**, **Local First**, module **Gestion Financière** complet (**v1.3.1**).

## Architecture

```
packages/
  domain/     — Logique métier, RBAC, audit, alertes, APP_VERSION
  db/         — SQLite/SQLCipher, repositories, FinanceModule, sync replay
apps/
  api/        — API REST Fastify (RBAC lectures + écritures)
  desktop/    — Interface React
```

## Fonctionnalités Finance

- Taux bidirectionnel USD↔CDF, recalcul auto, opérations REC/DEP/CAI/BAN
- Rubriques hiérarchiques, fonds optionnels (CRUD complet), enveloppes, promesses, comptage, caisse, banque (rapprochement + matching)
- Budgets, clôtures, corbeille (permission restaurer), audit filtrable
- Dashboards financier et pastoral, synthèses journalière → périodique
- Export PDF / Excel / CSV
- SQLCipher, export/import USB, **sync cloud avec replay des opérations**
- Notifications par église (sync, chiffrement, solde, budget)
- RBAC granulaire multi-églises

## Démarrage rapide

```bash
npm install
npm run dev
```

### Variables d'environnement

| Variable | Description |
|----------|-------------|
| `TABERNACLE_DATA_DIR` | Dossier données |
| `TABERNACLE_DB_KEY` | Clé SQLCipher |
| `TABERNACLE_SYNC_TOKEN` | Token partagé local ↔ VM pour `/sync/ingest` |
| `TABERNACLE_SYNC_CHURCH_ID` | Limite l'ingest à une église (recommandé sur VM) |
| `TABERNACLE_BOOTSTRAP_*` | Compte admin **créé une fois** au premier démarrage |
| `TABERNACLE_BOOTSTRAP_RESET=true` | Force la réinitialisation du mot de passe bootstrap |
| `TABERNACLE_ALERT_SOLDE_USD_MICRO` | Seuil alerte solde (micro-USD) |

## Sync cloud

1. Poste local : push via page Cloud (`/system/sync/push`)
2. Serveur VM : `POST /api/v1/sync/ingest` avec header `x-sync-token`
3. Les événements `financial_operation` sont **rejoués** (CREATE/UPDATE/DELETE/RESTORE) sur la base distante

## Tests & CI

```bash
npm run test:all      # typecheck (domain + db + api + desktop) + tests domaine
npm run build:all
```

## Installateur Windows

```powershell
npm run installer:win
```

Produit : `installer/output/TabernacleERP-Setup-1.3.1.exe`

## Roadmap

- Application Tauri native
- JWT / OAuth2
- Sync multi-entités étendue (enveloppes, taux…)
- Modules hors finance
