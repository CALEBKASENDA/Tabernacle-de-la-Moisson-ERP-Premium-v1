# Synchronisation & Sauvegardes (Local First -> Cloud Hybride)

## Principes
- **Local First** : toute écriture est d’abord persistée localement (SQLite chiffré).
- **Sync future** : dès maintenant, chaque mutation “métier” génère un événement dans un journal de synchronisation.
- **Offline** : en absence d’Internet :
  - le journal s’accumule localement
  - des snapshots chiffrés peuvent être exportés
- **Cloud Hybrid** :
  - quand Internet est disponible, les journaux sont envoyés
  - la restauration/reconciliation s’appuie sur des événements déterministes

## Journal des événements (Change Log)
Table conceptuelle `sync_event` (à implémenter dans la DB commune) :
- `event_id` (UUID)
- `church_id`
- `entity_type` (exchange_rate, financial_operation, etc.)
- `operation` (CREATE/UPDATE/DELETE/RESTORE/RECALC)
- `entity_id`
- `payload_json` (valeurs nécessaires)
- `causation_event_id` (optionnel)
- `created_at`
- `sync_status` (PENDING/ACKED/CONFLICT)

Chaque fois qu’on modifie un taux de change ou une opération, on logge l’événement correspondant.

## Stratégie de conflit (résolution intelligente)
Politique recommandée :
- Conflits sur écritures d’opération :
  - priorité à l’horodatage (Lamport) + cohérence business
  - si modification impossible (clôture, invariants), marquer CONFLICT et exiger résolution via interface audit
- Conflits sur taux de change :
  - recalcul déterministe après résolution du “taux courant”
  - marquage audit des recalculs

## Sauvegardes
Types :
- Sauvegarde automatique : snapshot chiffré + rotation
- Sauvegarde manuelle : export “point-in-time”
- Sauvegarde cloud : envoi chiffré du snapshot et/ou journal d’événements

Chiffrement :
- chiffrement au repos de la base (SQLCipher ou équivalent)
- chiffrement applicatif des pièces justificatives (clé par tenant + wrapping)

## Restauration multi-postes
Procédure :
1. restauration du snapshot local chiffré
2. application des événements sync manquants (ordre causal)
3. vérification d’intégrité (hash chain optionnelle)
4. recalcul des vues dérivées si nécessaire

## Préparation API future
La synchronisation utilisera une API REST/GraphQL future.
Ce module définit déjà un format d’événement stable (versionné) :
- `schema_version`
- payload typé par `entity_type`

