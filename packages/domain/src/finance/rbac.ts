export type RoleCode =
  | 'SUPER_ADMIN'
  | 'ADMIN_CHURCH'
  | 'TREASURER'
  | 'ACCOUNTANT'
  | 'DATA_ENTRY_OPERATOR'
  | 'AUDITOR'
  | 'READ_ONLY'
  | string;

export type PermissionAction =
  | 'voir'
  | 'ajouter'
  | 'modifier'
  | 'supprimer'
  | 'restaurer'
  | 'exporter'
  | 'imprimer'
  | 'administrer';

export type PermissionResource =
  | 'finance:operations'
  | 'finance:rubriques'
  | 'finance:funds'
  | 'finance:exchange-rates'
  | 'finance:envelopes'
  | 'finance:pledges'
  | 'finance:counting'
  | 'finance:cash'
  | 'finance:bank'
  | 'finance:budgets'
  | 'finance:closures'
  | 'finance:audit'
  | 'finance:reports'
  | string;

export type PermissionCode = string; // ex: finance:operations:read

export type AuthorizationContext = {
  churchId: string;
  userId: string;
  roleCodes: RoleCode[];
  permissions: Set<PermissionCode>;
};

export function assertHasPermission(params: {
  ctx: AuthorizationContext;
  permissionCode: PermissionCode;
  denyMessage?: string;
}): void {
  const { ctx, permissionCode, denyMessage } = params;
  if (!ctx.permissions.has(permissionCode)) {
    throw new Error(denyMessage ?? `Permission denied: ${permissionCode}`);
  }
}

/**
 * Helper to build canonical codes.
 * The DB/policy layer can store the exact code; Domain just standardizes formatting.
 */
export function buildPermissionCode(params: {
  resource: PermissionResource;
  action: PermissionAction;
}): PermissionCode {
  // Canonical: <resource>:<action>
  return `${params.resource}:${params.action}`;
}

