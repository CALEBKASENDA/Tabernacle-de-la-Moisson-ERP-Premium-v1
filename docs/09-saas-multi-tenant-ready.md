# SaaS Multi-églises Ready (Design Tenancy)

## Modèle
Le même schéma applicatif supporte :
- Desktop Local
- Desktop LAN (sync locale)
- Web/Mobile
- SaaS multi-tenants

## Option de déploiement
1. Mode Local First (desktop) :
   - une base SQLite par poste
   - sync par journaux d’événements
2. Mode Cloud hybride :
   - un backend d’API sécurisé
   - stockage chiffré + journaux
3. SaaS :
   - isolement par `church_id`
   - row-level protection + contraintes

## Isolation stricte
- `church_id` obligatoire sur toutes les lignes finance
- politiques d’accès :
  - filtrage `church_id` au niveau service + couches persistence
- audit ne peut pas traverser les tenants

