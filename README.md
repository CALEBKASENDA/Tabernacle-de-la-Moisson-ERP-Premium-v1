# Tabernacle de la Moisson ERP Premium

ERP professionnel multi-églises, **Desktop First**, **Local First**, module **Gestion Financière** complet (**v1.5.2**).

## Architecture

```
packages/
  domain/     — Logique métier, RBAC, audit, alertes, APP_VERSION
  db/         — SQLite/SQLCipher, repositories, FinanceModule, sync replay
apps/
  api/        — API REST Fastify (RBAC lectures + écritures)
  desktop/    — Interface React + shell **Tauri** (application native)
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
npm run setup      # première installation (.env, clés, dossier data)
npm install
npm run dev
```

### Variables d'environnement

| Variable | Description |
|----------|-------------|
| `TABERNACLE_DATA_DIR` | Dossier données |
| `TABERNACLE_DB_KEY` | Clé SQLCipher |
| `TABERNACLE_SYNC_TOKEN` | Token partagé local ↔ VM pour `/sync/ingest` |
| `TABERNACLE_JWT_SECRET` | Secret JWT (Bearer) pour web/mobile/API |
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

## Application desktop native (Tauri)

Fenêtre Windows dédiée (sans ouvrir Chrome manuellement). L'API Node démarre automatiquement en arrière-plan.

**Prérequis :** [Rust](https://rustup.rs/) (cargo), Node.js 22+

```powershell
# Développement — fenêtre native + hot-reload Vite
npm run desktop:native:dev

# Production — installeur .msi / .exe Tauri
npm run desktop:native:build
```

Installateur généré : `apps/desktop/src-tauri/target/release/bundle/`

| Mode | Interface | API |
|------|-----------|-----|
| `npm run dev` | Navigateur (5173) | 3847 |
| `npm run desktop:native:dev` | Fenêtre Tauri | 3847 (auto) |
| Installateur Inno Setup | Navigateur auto | 3847 (auto) |
| `npm run desktop:native:build` | Fenêtre Tauri | 3847 embarquée |

Données natives Tauri : `%APPDATA%\com.tabernacle.moisson.erp\data\`

## GitHub (2 dépôts privés)

| Dépôt | Contenu |
|-------|---------|
| [Tab.-de-la-Moisson-ERP-Premium-v1.3.1](https://github.com/CALEBKASENDA/Tab.-de-la-Moisson-ERP-Premium-v1.3.1) | Code + données + [installateurs (Releases)](https://github.com/CALEBKASENDA/Tab.-de-la-Moisson-ERP-Premium-v1.3.1/releases) |
| [Tabernacle-de-la-Moisson-ERP-Donnees](https://github.com/CALEBKASENDA/Tabernacle-de-la-Moisson-ERP-Donnees) | Copie `data\`, `config\.env` |

**Synchroniser tout en ligne** (après avoir utilisé l'ERP) :

```powershell
npm run github:sync
```

**Récupérer sur un autre PC** :

```powershell
git clone https://github.com/CALEBKASENDA/Tab.-de-la-Moisson-ERP-Premium-v1.3.1.git
cd Tab.-de-la-Moisson-ERP-Premium-v1.3.1
npm install
npm run dev
```

> Gardez les deux dépôts **strictement privés** (mots de passe, opérations financières). L'ancien dépôt `Tabernacle-de-la-Moisson-ERP-Premium-v1` est archivé — utilisez **v1.3.1**.

## Installateur Windows (Inno Setup)

```powershell
npm run installer:win
```

Produit : `installer/output/TabernacleERP-Setup-1.5.2.exe`

## Application mobile (Expo)

Consultation finance et pastoral depuis smartphone (Android / iOS).

```bash
# API démarrée (npm run dev) — sur appareil physique, éditez apps/mobile/app.json → extra.apiBaseUrl
npm run mobile:start
```

## Roadmap

- Intégrations OAuth avancées (provisionnement auto des comptes)
- Notifications push mobile
- Modules RH et inventaire
