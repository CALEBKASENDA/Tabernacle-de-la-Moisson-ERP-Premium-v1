# Contrat API futur (Web/Mobile/SaaS/Cloud Hybride)

> Ce document décrit le contrat de conception, pas l'implémentation serveur.  
> Le but est de rendre le module finance “API-ready” sans refonte.

## Modèle de sécurité API
- Authentication via tokens (OAuth2/OIDC ou équivalent) pour Web/Mobile.
- Authorisation RBAC + tenanting obligatoire.
- Chiffrement transport TLS.
- Audit côté serveur également (append-only).

## Multi-tenancy
Chaque endpoint accepte :
- `churchId` via token claims ou champ explicite (au choix selon design).

Règles :
- Tous les endpoints “read/write” scindent strictement par `churchId`.
- Les ids d’entités sont vérifiées pour appartenir au tenant.

## Endpoints (exemples finance)
- `GET /finance/operations?dateFrom=&dateTo=&categoryId=&fundId=&eventId=&...`
- `POST /finance/operations`
- `PATCH /finance/operations/:id` (avec constraints closure)
- `POST /finance/operations/:id/archive` (corbeille)
- `POST /finance/operations/:id/restore`

- `GET /finance/exchange-rates?effectiveDate=...`
- `POST /finance/exchange-rates`

- `GET /finance/reports/summary?period=...`
- `POST /finance/reports/export` (PDF/XLSX/CSV)

## Format de payload (stabilité)
- Versionner les schémas (`schema_version`)
- Utiliser DTO “Money” :
  - amounts saisies (CDF)
  - taux utilisés (quote-per-base)
  - montants dérivés (USD converti)
- Garantir l’idempotence des sync events (clé unique).

