export type TenantContext = {
  churchId: string;
  siteId?: string | null;

  userId: string;
  sessionId: string;
  workstationId: string;
};

