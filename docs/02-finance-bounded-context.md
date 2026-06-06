# Module Finance — Bounded Contexts & Invariants

## Objectifs du module
Le module `Gestion financière` doit couvrir, pour chaque église (tenant), l’ensemble du cycle de vie :
- Master data : devises, taux de change, rubriques, fonds dédiés, événements, cultures/types, paramètres.
- Saisie comptable métier : opérations (recettes/dépenses), enveloppes, promesses de foi, comptage des offrandes.
- Gestion des supports : caisse, comptes bancaires, dépôts/retraits/virements, rapprochement bancaire.
- Pilotage : budgets, synthèses, rapports, tableaux de bord, indicateurs pastoraux.
- Gouvernance : audit complet, archivage, suppression logique, corbeille, clôture financière et verrouillage.

## Isolation multi-églises (tenanting)
Invariant absolu : aucune donnée d’une église ne doit être visible depuis une autre.

Implémentation :
- Chaque table “finance” porte `church_id` (NOT NULL).
- Chaque clé étrangère finance inclut `church_id` (ou la vérification est assurée via contraintes applicatives et vues de sécurité).
- Toutes les requêtes data-access exigent `churchId` explicitement.
- La couche Domain n’utilise jamais de données hors tenant.

## Concepts clés

### 1) Tenant = Église
Une église possède :
- ses utilisateurs, sessions, postes de travail
- ses rubriques, fonds dédiés, enveloppes, promesses
- ses opérations financières, pièces justificatives
- ses budgets, clôtures et verrous

### 2) Money & Devises
- Le système supporte plusieurs devises (au minimum : `USD`, `CDF`, `EUR`, `GBP`, extensible).
- Les opérations peuvent être saisies dans une devise canonique (CDF) et convertir vers d’autres devises selon taux de change par date.
- Les conversions doivent être déterministes et tracées :
  - `exchange_rate_id` (ou une référence aux taux par date) est stocké dans l’opération pour audit/performance.

### 3) Rubriques (dynamique, hiérarchique)
- Les rubriques ne sont jamais codées en dur.
- Elles sont hiérarchisables (`parent_id`) et ont un état logique (active/inactive/supprimée logique).
- Toute nouvelle rubrique doit être automatiquement disponible :
  - dans les rapports, filtres, synthèses, exportations, tableaux de bord.

### 4) Fonds dédiés
- Nombre illimité de fonds.
- Chaque fonds possède :
  - solde propre
  - historique
  - rapports et tableaux de bord

### 5) Événements (culte & opérations associées)
- Un événement a un type (ex : `Culte dominical`, `Veillée`, etc.) et une chronologie.
- Toute opération financière peut être associée à un événement.

### 6) Opérations financières
Chaque opération :
- a un `date`
- a une `piece_number` (numérotation automatique, sans doublon)
- référence rubrique, fonds, bénéficiaire, éventuellement événement
- contient recettes et dépenses (CDF et conversions USD selon règles)
- stocke les taux du jour utilisés
- produit des lignes d’audit

Invariants :
- Un taux doit exister pour la date de l’opération (sinon refus ou règle de repli explicitement paramétrée).
- Le recalcul des montants convertis suit la règle : conversion à partir des montants CDF vers les devises cibles.
- Les montants dérivés sont recalculés lorsque les taux sont modifiés (et l’audit suit cette correction).

### 7) Clôture financière (verrouillage)
Une clôture bloque les modifications :
- mensuelle / trimestrielle / annuelle
- verrouillage automatique à la clôture
- historisation complète

Invariant : après clôture, toute action “modifier opération / date / montant / rubrique / bénéficiaire” est refusée (sauf rôle d’admin avec procédure d’exception auditée et option de restauration/archivage selon politique).

## Cycle de vie & états
Modèle d’état recommandé :
- `active` : opération consultable et modifiable selon permissions/lock
- `archived` : opération archivée (supprimée logique / corbeille)
- `restored` : restauration (retour état active)

## Traçabilité & audit
Toute modification :
- crée une entrée dans `audit_log` contenant ancienne valeur et nouvelle valeur
- associe l’église (`church_id`), session (`session_id`), poste de travail (`workstation_id`)

## Performance
- Index multi-tenant sur `church_id` + colonnes filtrées fréquentes (date, rubrique_id, fund_id).
- Agrégations (synthèses/solde) calculées via :
  - vues matérialisées (ou cache local) si nécessaire,
  - ou requêtes optimisées avec index (au départ).

