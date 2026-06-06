# RBAC, Permissions Dynamiques & Audit (Finance)

## Rôles par défaut (tenants indépendants)
Chaque rôle est défini pour le module finance et peut être étendu via rôles personnalisés.

- `SUPER_ADMIN`
- `ADMIN_CHURCH`
- `TREASURER` (Trésorier)
- `ACCOUNTANT` (Comptable)
- `DATA_ENTRY_OPERATOR` (Opérateur de saisie)
- `AUDITOR` (Auditeur)
- `READ_ONLY` (Consultation seule)

## Actions & permissions dynamiques
Les permissions doivent être configurables sans modifier le code, via une table “policy” :
- `voir`
- `ajouter`
- `modifier`
- `supprimer`
- `restaurer`
- `exporter`
- `imprimer`
- `administrer`

Règle : une permission est toujours évaluée dans le contexte :
- `church_id`
- `site_id` (si applicable)
- `entity` (ex : operations, rubriques, fonds, taux)
- `action` (voir/ajouter/modifier/...)
- `resource state` (active vs archived vs deleted)

## Modèle d’autorisation recommandé
1. RBAC : rôle -> ensemble de permissions.
2. ABAC léger (contextuel) : contraintes de période après clôture, état des entités (inactive vs archived), ownership par session.
3. Tenant scoping : toutes les actions “data write”/“data read” passent par un filtre de `church_id` et échouent si mismatch.

## Permissions spécifiques aux fonctionnalités (exemples d’invariants)
### Opérations financières
- `ajouter` : autorise création + numérotation.
- `modifier` : autorise modification tant que période non clôturée.
- `supprimer` : interdit suppression définitive ; nécessite `deletion_reason` + `deleted_at`.
- `restaurer` : rétablit une opération archivée si permissions et politiques autorisent.

### Taux de change
- `modifier` : déclenche recalcul automatique déterministe des conversions sur les opérations de la date concernée.
- `exporter` : autorise export historique.

### Rubriques/Fonds
- `administrer` : peut désactiver/supprimer logique/réordonner hiérarchie.

## Audit complet (consultable à vie)
Toute mutation doit générer :
- `actor_user_id`
- `church_id`
- `session_id`
- `workstation_id`
- `action` (CREATE/UPDATE/DELETE/RESTORE/ARCHIVE/IMPORT/SYNC_CONFLICT_RESOLUTION)
- `entity_type` (ex : `financial_operation`, `exchange_rate`)
- `entity_id`
- `old_value_json`
- `new_value_json`
- `changed_at` (timestamp)
- `metadata_json` (optionnel : champs supplémentaires, reason de suppression, etc.)

Contraintes :
- audit append-only : pas de suppression, pas d’UPDATE.
- archivage long terme : partition/rotation logique (table enfants ou archivage sur disque chiffré).

## Poste de travail (anti-répudiation)
Chaque session locale doit associer un `workstation_id` :
- identifiant généré localement
- enregistré à la création de la session
- utilisé pour l’audit

