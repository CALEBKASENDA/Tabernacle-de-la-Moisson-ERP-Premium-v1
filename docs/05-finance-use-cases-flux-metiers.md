# Module Finance — Cas d'utilisation & Flux métier

## Hypothèses communes (toutes les églises, multi-sites)
- Chaque requête transporte `churchId` + `userId` + `sessionId` + `workstationId`.
- Toute écriture déclenche :
  - validation RBAC (permissions dynamiques)
  - vérification clôture active (verrouillage période)
  - validation invariants Domain
  - écriture DB en transaction
  - écriture audit append-only

## 1) Gestion des églises (multi-églises)
### 1.1 Création d’une église
Flux :
1. `SUPER_ADMIN` saisit `name`.
2. Création `church` + création de paramètres par défaut finance.
3. Création d’un admin église (optionnel).
Audit : CREATE church.

### 1.2 Désactivation & suppression logique
Flux :
1. Admin église ne voit que son tenant.
2. `status` passe à `disabled` (suppression logique).
3. Aucune donnée finance n’est effacée physiquement.
Audit : UPDATE church.status.

## 2) Gestion dynamique des rubriques
### 2.1 Ajouter une rubrique
Flux :
1. Rôle autorisé (`administrer` ou `ajouter` selon policy).
2. Vérifier unicité `name` (par tenant) si exigée.
3. Insérer `finance_category` avec `parent_id` optionnel.
4. Les écrans de filtres, rapports et dashboards utilisent directement la table (aucun code en dur).
Audit : CREATE finance_category.

### 2.2 Désactiver / supprimer logique
Flux :
1. Mettre `status=inactive|deleted` et enregistrer `deletion_reason`.
2. Les opérations existantes restent consultables (historiques).
3. Les nouvelles sélections UI excluent les rubriques `deleted`.
Audit : UPDATE finance_category.

### 2.3 Réorganiser la hiérarchie
Flux :
1. Modifier `parent_id` et/ou `sort_order`.
2. Validation anti-cycles (A -> B -> A).
3. Recalcul d’arbres côté UI si nécessaire.
Audit : UPDATE finance_category.

## 3) Taux de change (taux du jour + historique)
### 3.1 Ajouter un taux
Flux :
1. Autorisation `modifier` sur exchange rates.
2. Vérifier absence de conflit sur `(base, quote, effective_date)` pour l’église.
3. Insérer/mettre à jour `exchange_rate`.
4. Déclencher un recalcul :
   - toutes les opérations (financial_operation + envelope + cash_transaction + bank_transaction + pledge payments) de la date
   - recalculer les champs dérivés USD (`*_usd_converted`) et `usd_rate_quote_per_1_usd`.
5. Écrire audit global (taux modifié + recalculs).
Notifications :
- alerte `Changement du taux de change`.
Audit : UPDATE/CREATE exchange_rate + UPDATE-derived via action spécifique.

### 3.2 Consulter anciens taux
Flux :
- l’UI interroge l’historique des versions (ou audit export si la table d’historique n’est pas activée).

## 4) Gestion des devises
Flux :
- L’ajout de devise implique une entrée dans `currency`.
- Aucun code ne doit être modifié :
  - Les conversions s’appuient sur les taux par date.

## 5) Opérations financières (recettes & dépenses)
### 5.1 Création d’une opération
Entrées UI :
- date opération
- piece_type (REC/DEP/CAI/BAN selon contexte)
- libellé, bénéficiaire
- rubrique catégorie, fonds
- événement optionnel
- recettes CDF / dépenses CDF / dépenses USD (selon écran)
Process :
1. Vérifier permission `ajouter`.
2. Vérifier période non clôturée.
3. Résoudre `exchange_rate` pour la date (si conversions USD nécessaires).
4. Générer `piece_number` via `numbering_sequence` (contrainte d’unicité).
5. Calculer montants dérivés :
   - `receipts_usd_converted`
   - `expenses_usd_converted`
6. Insérer `financial_operation`.
7. Insérer pièces justificatives si présentes (chiffrées).
8. Écrire audit (CREATE).
Notifications :
- alerte `Modification importante` uniquement si montant > seuil paramétré.

### 5.2 Modification d’une opération
Process :
1. Vérifier permission `modifier`.
2. Vérifier période non clôturée.
3. Si date change -> recalcul des conversions (si USD impacté).
4. Si rubrique/fonds change -> pas de suppression, seules les FK changent.
5. Écrire audit : old/new valeurs par champ.

### 5.3 Suppression logique
Process :
1. Vérifier permission `supprimer`.
2. Exiger `deletion_reason` obligatoire.
3. Mettre `deleted_at` + `deletion_reason` + `archived_at`.
4. Exclure du calcul des synthèses par défaut (UI “corbeille” l’affiche).
5. Écrire audit : action DELETE (logique).
Notifications :
- alerte `Suppression importante`.

### 5.4 Restauration
Process :
1. permission `restaurer`
2. Vérifier la période n’est pas en situation incompatible (clôture + policy).
3. Effacer `deleted_at`/`archived_at`.
4. Recalcul si nécessaire (taux par date).
Audit : action RESTORE.

## 6) Enveloppes
Flux :
1. Ajouter enveloppe : montant CDF + conversions USD.
2. Recherche avancée par `follower`, `envelope_number`, date, rubrique, fonds.
3. Option de “poster vers opérations” :
   - à la validation du comptage ou à la demande
   - création d’une `financial_operation` liée (champ `event_id`/cat/fund)
Audit : CREATE envelope, éventuellement CREATE linked operation.

## 7) Promesses de foi
Flux :
1. Création promesse : montant promis, échéances.
2. Versements : chaque versement crée une entrée `faith_pledge_payment`.
3. Solde restant calculé :
   - `sum(versements) -> soldes`
4. Recalcule conversions selon taux de la date du versement.
Audit : CREATE payment, UPDATE pledge derived.

## 8) Comptage des offrandes
Flux :
1. Ouvrir séance (status=opened).
2. Ajouter lignes de comptage (catégorie/fonds + montants).
3. Validation séance :
   - status=validated
   - génération des opérations financières correspondantes (liées)
4. Audit : VALIDATE counting_session + CREATE operations.
Notifications :
- modification importante si écarts importants.

## 9) Caisse
Flux :
1. Ouvrir caisse : `cash_session` status=open.
2. Saisir transactions CAI : pièce_number via séquence CAI.
3. Clôturer :
   - calcul attendu
   - `cash_diff_cdf` (clôture - attendu)
   - si écart > seuil -> alerte.
Audit : CREATE cash_session + UPDATE cash_session close + CREATE cash_transaction.

## 10) Banque
Flux :
1. Gérer `bank_account`.
2. Ajouter `bank_transaction` (pièce BAN).
3. Rapprochement :
   - créer `bank_reconciliation`
   - matcher lignes
4. Audit : CREATE bank_transaction + CREATE reconciliation.

## 11) Budgets & Synthèses
Flux :
1. Définir budget par période (mensuel, trimestriel, semestriel, annuel).
2. Saisir lignes (par rubrique et éventuellement par fonds).
3. Réalisé :
   - agrégation des opérations dans la période et conversion USD.
4. Calcul :
   - Prévu / Réalisé / Écart / Taux d’exécution

## 12) Clôture financière
Flux :
1. `ADMIN_CHURCH` ou `ACCOUNTANT` (selon policy) lance clôture.
2. Vérifier aucune modification “en cours” (option de locking).
3. Créer `financial_closure`.
4. Mettre `is_locked_by_closure=1` sur opérations concernées (ou appliquer lock par requête).
5. Historiser et archiver.

## 13) Alertes & notifications (règles)
Déclenchées automatiquement par services :
- Solde faible : si solde fonds/caisse < seuil paramétré.
- Fonds insuffisant : si opération liée fonds nécessite réserve (si règles de fonds le demandent).
- Sauvegarde échouée : si job local de backup échoue.
- Modification importante : delta montant > seuil ou changement d’informations sensibles.
- Suppression importante : suppression logique d’entités critiques.
- Changement du taux de change : pour la date concernée.

