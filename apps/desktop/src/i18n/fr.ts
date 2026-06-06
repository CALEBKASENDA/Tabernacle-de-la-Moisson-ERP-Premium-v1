const ROLES: Record<string, string> = {
  SUPER_ADMIN: 'Administrateur principal',
  ADMIN_CHURCH: 'Administrateur d\'église',
  TREASURER: 'Trésorier',
  ACCOUNTANT: 'Comptable',
  DATA_ENTRY_OPERATOR: 'Saisisseur',
  AUDITOR: 'Auditeur',
  READ_ONLY: 'Lecture seule',
};

const PERMISSIONS: Record<string, string> = {
  'finance:operations:voir': 'Voir les opérations',
  'finance:operations:ajouter': 'Ajouter des opérations',
  'finance:operations:modifier': 'Modifier les opérations',
  'finance:operations:supprimer': 'Supprimer les opérations',
  'finance:operations:restaurer': 'Restaurer les opérations',
  'finance:exchange-rates:modifier': 'Modifier les taux de change',
  'finance:reports:voir': 'Voir les rapports',
  'finance:audit:voir': 'Voir le journal d\'audit',
  'admin:churches:administrer': 'Administrer les églises',
  'admin:users:administrer': 'Administrer les utilisateurs',
  'admin:security:administrer': 'Administrer la sécurité',
};

const ERREURS: Record<string, string> = {
  'Authentification requise': 'Authentification requise',
  'Permission refusée': 'Permission refusée',
  'Identifiants invalides': 'Identifiants invalides',
  'Invalid money value': 'Montant invalide',
  'Session expirée': 'Session expirée',
  'Unauthorized': 'Non autorisé',
  'Forbidden': 'Accès interdit',
  'Réservé à l\'administrateur principal': 'Réservé à l\'administrateur principal',
  'Internal Server Error': 'Erreur interne du serveur',
};

const STATUTS: Record<string, string> = {
  active: 'Active',
  disabled: 'Désactivée',
  inactive: 'Inactive',
};

export function libellerRole(code: string): string {
  return ROLES[code.trim()] ?? code;
}

export function libellerRoles(roles: string): string {
  if (!roles.trim()) return '—';
  return roles.split(',').map((r) => libellerRole(r.trim())).join(', ');
}

export function libellerPermission(code: string): string {
  return PERMISSIONS[code] ?? code;
}

/** Regroupe les permissions pour l'éditeur d'accès utilisateur */
export const GROUPES_PERMISSIONS: Array<{ titre: string; codes: string[] }> = [
  {
    titre: 'Finance — opérations',
    codes: [
      'finance:operations:voir',
      'finance:operations:ajouter',
      'finance:operations:modifier',
      'finance:operations:supprimer',
      'finance:operations:restaurer',
      'finance:exchange-rates:modifier',
    ],
  },
  {
    titre: 'Finance — rapports & audit',
    codes: ['finance:reports:voir', 'finance:audit:voir'],
  },
  {
    titre: 'Administration',
    codes: ['admin:churches:administrer', 'admin:users:administrer', 'admin:security:administrer'],
  },
];

export function libellerStatut(code: string): string {
  return STATUTS[code] ?? code;
}

export function traduireErreur(message: string): string {
  return ERREURS[message] ?? message;
}
