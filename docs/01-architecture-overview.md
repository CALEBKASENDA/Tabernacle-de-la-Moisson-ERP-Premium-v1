# Architecture Overview (Enterprise Ready)

## Philosophie générale
- **Desktop First** : le produit principal est une application desktop.
- **Local First** : la base de données locale est la source de vérité en mode hors ligne.
- **Web/Mobile Ready** : l’API et le domaine sont conçus pour être exposés plus tard.
- **Cloud Hybride Ready** : synchronisation et sauvegarde cloud planifiées dès la conception.
- **SaaS Multi-églises Ready** : un même “schéma applicatif” supporte plusieurs églises avec isolation stricte.

## Séparation stricte des préoccupations
1. **Interface utilisateur (UI)** : composants (desktop) + rendu responsive.
2. **Logique métier (Domain)** : règles métier, calculs, numérotation, clôture, états, invariants.
3. **Services** :
   - Services applicatifs (use-cases : créer opération, valider comptage, rapprocher banque…)
   - Services de sécurité (RBAC/permissions, scopes, audit, chiffrement)
   - Services de synchronisation (journal de sync, résolution de conflits)
4. **Sécurité** : authentification, autorisation, audit immuable, anti-corruption multi-tenant.
5. **Base de données (Persistence)** : modèles, migrations, index, contraintes, archivage logique.
6. **Rapports** : agrégations auditées (recalcul déterministe à partir du journal métier si besoin).

## Isolation multi-églises (règle absolue)
Chaque requête applicative est exécutée avec un **scope `tenantId` = `churchId`**.
- L’UI ne reçoit jamais de données hors de son `churchId`.
- Le backend applique un filtre obligatoire sur toutes les tables tenantes.
- Les clés étrangères, index et vues de sécurité renforcent l’isolation.
- Le RBAC empêche tout contournement : même en cas d’erreur UI, les services bloquent.

### Règle de scoping obligatoire
Tout accès à la persistance finance doit passer par un “data access layer” qui impose :
- `church_id` sur tous les enregistrements
- `site_id` quand applicable (multi-sites)
- `user_id` et `session_id` pour audit et traçabilité

## Fonctionnement hors ligne et synchronisation
- **Offline** : création/édition/validation d’opérations s’appuie sur le local store uniquement.
- **Synchronisation** : en présence d’Internet, le système publie un journal d’événements (change log) et réconcilie.
- **Sauvegarde** :
  - locale automatique (rotation + intégrité)
  - manuelle (point-in-time)
  - cloud hybride (chiffré) pour restauration multi-postes.

## Audit immuable et versionné
Toute opération “métier” produit des entrées auditées :
- Qui (utilisateur, rôles, session)
- Quoi (entité, action)
- Ancienne valeur / nouvelle valeur
- Date/heure
- Église
- Poste de travail

L’audit est consultable “à vie” et exportable.

## Objectifs de qualité (non négociables)
- Robustesse des données : contraintes DB + invariants Domain.
- Maintenabilité : dépendances unidirectionnelles (UI -> Domain -> Services -> Persistence).
- Sécurité : chiffrement des secrets + chiffrement des pièces justificatives + limitation stricte d’accès.
- Performance : index multi-tenant, requêtes agrégées optimisées.

