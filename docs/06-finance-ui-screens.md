# Écrans UI (Desktop First, Responsive)

> Les écrans sont décrits de façon “contrat” : champs, actions, contraintes (permissions, clôtures, corbeille) et sources de données.

## Navigation globale
- `Dashboard Finance` (temps réel)
- `Dashboard Pastoral` (lecture seule)
- `Opérations` (REC/DEP/CAI/BAN)
- `Rubriques`
- `Fonds dédiés`
- `Événements`
- `Taux de change`
- `Enveloppes`
- `Promesses de foi`
- `Comptage des offrandes`
- `Caisse`
- `Bancaire`
- `Budgets`
- `Clôtures financières`
- `Rapports & Exportations`
- `Audit & Corbeille`

## Dashboard Finance (temps réel)
Champs (calculés à partir des opérations non supprimées) :
- Solde global
- Recettes du jour
- Dépenses du jour
- Recettes du mois
- Dépenses du mois
- Solde du mois
- Nombre total d’opérations
- Dernières opérations
Graphiques :
- évolution recettes
- évolution dépenses
- répartition par rubrique
- comparaison mensuelle
- comparaison annuelle
- répartition par fonds

Contraintes :
- isolation tenant : filtrage `churchId`
- recalculs immédiats après modif/taux clôture selon règles

## Dashboard Pastoral (mode consultation uniquement)
Champs :
- Situation financière globale
- Recettes, Dépenses, Solde
- Fonds dédiés + évolution mensuelle
Permissions :
- aucune action write

## Opérations (liste + recherche + filtres)
Colonnes demandées :
- Date
- Numéro de pièce
- Libellé
- Bénéficiaire
- Rubrique
- Fonds
- Événement
- Recettes CDF
- Recettes converties USD
- Dépenses CDF
- Dépenses converties USD
- Dépenses USD
- Observation
- Taux du jour
- Utilisateur créateur
- Date création
- Date modification

Actions :
- `Créer opération` (si permission)
- `Modifier` (si autorisé & période non clôturée)
- `Supprimer logique` (si autorisé + motif obligatoire)
- `Voir pièces justificatives`
- `Archiver/restaurer` (si corbeille)

## Opération (formulaire)
Champs :
- `op_date`
- `piece_type` (REC/DEP/CAI/BAN)
- `label`, `beneficiary`
- `category_id`, `fund_id`, `event_id` optionnel
- montants : recettes_cdf, dépenses_cdf, dépenses_usd
- taux : affichage du “taux du jour” et recalcul auto
- observation + pièces justificatives (PDF/images)

Validation :
- vérifier taux disponible pour `op_date`
- vérifier permissions
- vérifier clôture active

## Rubriques (CRUD dynamique + hiérarchie)
Écran :
- liste arbre (parent/enfant) + recherche
Actions :
- Ajouter / Modifier / Désactiver / Supprimer logique
- Réorganiser (drag & drop ou champs parent/sort_order)

## Fonds dédiés (CRUD)
- liste + solde courant (calcul via opérations)
- historique
- désactivation/suppression logique

## Taux de change (CRUD + historique)
- table par date : base=USD, quote=CDF (et futurs couples)
- édition du taux du jour
- consultation des anciens taux

## Enveloppes
Form :
- numéro enveloppe, fidèle, date, rubrique, fonds, montant, observation
Recherche avancée :
- par fidèle, numéro, date, rubrique, fonds, montant
Historique :
- corbeille (suppression logique si permise)

## Promesses de foi
Écrans :
- liste promesses + soldes
- détail promesse (montant promis, versé, solde restant)
- création versement + historique des versements

## Comptage des offrandes
Écrans :
- séance de comptage :
  - état ouverte/validée
  - équipe de comptage
  - compteurs (liste)
  - lignes comptées par rubrique/fonds
  - validation (génère opérations)

## Caisse
Écrans :
- liste caisses
- session :
  - ouverture : solde ouverture
  - transactions CAI (pièces)
  - clôture : solde clôture + contrôle des écarts
  - historique

## Banque
Écrans :
- liste comptes bancaires
- transactions BAN :
  - dépôt/retrait/virement
  - pièces justificatives optionnelles
- rapprochement :
  - création séance de rapprochement
  - matcher transactions vs lignes du relevé

## Budgets
- écran budget annuel/semestriel/trimestriel/mensuel
- lignes par rubrique et éventuellement par fonds
- affichage :
  - prévu, réalisé, écart, taux d'exécution

## Clôtures financières
- création clôture mensuelle/trimestrielle/annuelle
- affichage statut locked
- historique des clôtures

## Rapports & Exportations
Rapports demandés :
- rapport des recettes
- rapport des dépenses
- rapport des rubriques
- rapport des fonds
- rapport des cultes (événements)
- rapport des événements
- rapport des promesses de foi
- rapport des enveloppes
- rapport de caisse
- rapport bancaire
- rapport d’audit
- rapport de synthèse générale
Export :
- PDF, Excel, CSV, Impression

## Audit & Corbeille
- corbeille : consulter/filtrer/restaurer
- audit log : rechercher par entité, action, date, utilisateur, église
- aucune suppression définitive

