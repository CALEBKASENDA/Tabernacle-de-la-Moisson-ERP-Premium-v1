import { getAuthHeaders } from '../context/AuthContext';
import { traduireErreur } from '../i18n/fr';

const API_BASE = '/api/v1';

async function parseJsonResponse<T>(res: Response): Promise<{ json: T; res: Response }> {
  const text = await res.text();
  if (!text) {
    if (res.status === 502 || res.status === 504 || res.status === 0) {
      throw new Error('Serveur API indisponible. Relancez Tabernacle de la Moisson ERP.');
    }
    throw new Error(`Réponse vide du serveur (HTTP ${res.status})`);
  }
  try {
    return { json: JSON.parse(text) as T, res };
  } catch {
    throw new Error(
      res.ok
        ? 'Réponse serveur invalide (JSON attendu)'
        : `Erreur serveur (HTTP ${res.status})`
    );
  }
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders(),
        ...options?.headers,
      },
    });
  } catch {
    throw new Error('Impossible de joindre l\'API. Vérifiez que l\'application est démarrée.');
  }
  const { json } = await parseJsonResponse<{ error?: string } & T>(res);
  if (!res.ok) {
    const msg = json.error?.trim();
    throw new Error(traduireErreur(msg && msg !== 'Internal Server Error' ? msg : `Erreur HTTP ${res.status}`));
  }
  return json;
}

export const api = {
  getDashboard: () => request<{ data: DashboardData }>('/finance/dashboard'),
  getTauxDuJour: () => request<{ data: TauxDuJour | null }>('/finance/exchange-rates/today'),
  getRateHistory: () => request<{ data: RateHistoryItem[] }>('/finance/exchange-rates/history'),
  setRate: (body: SetRateBody) =>
    request<{ data: { recalculatedOperations?: number } }>('/finance/exchange-rates', { method: 'POST', body: JSON.stringify(body) }),
  getCategories: () => request<{ data: Category[] }>('/finance/categories'),
  getFunds: () => request<{ data: Fund[] }>('/finance/funds'),
  getOperations: (params?: { dateFrom?: string; dateTo?: string; fundId?: string }) => {
    const q = new URLSearchParams(params as Record<string, string>).toString();
    return request<{ data: Operation[] }>(`/finance/operations${q ? `?${q}` : ''}`);
  },
  exportOperationsCsv: async (params?: { dateFrom?: string; dateTo?: string; fundId?: string }) => {
    const q = new URLSearchParams(params as Record<string, string>).toString();
    const res = await fetch(`${API_BASE}/finance/operations/export.csv${q ? `?${q}` : ''}`, {
      headers: getAuthHeaders(),
    });
    if (!res.ok) throw new Error(`Export CSV échoué (HTTP ${res.status})`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `operations_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  },
  createOperation: (body: CreateOperationBody) =>
    request<{ data: { operationId: string; pieceNumber: string } }>('/finance/operations', { method: 'POST', body: JSON.stringify(body) }),
  deleteOperation: (id: string, reason: string) =>
    request(`/finance/operations/${id}/delete`, { method: 'POST', body: JSON.stringify({ reason }) }),
  getOperationAttachments: (operationId: string) =>
    request<{ data: OperationAttachment[] }>(`/finance/operations/${operationId}/attachments`),
  addOperationAttachment: (operationId: string, body: { fileName: string; mimeType?: string; contentBase64: string }) =>
    request<{ data: { attachmentId: string } }>(`/finance/operations/${operationId}/attachments`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  getAttachmentContent: (attachmentId: string) =>
    request<{ data: { attachmentId: string; fileName: string; mimeType: string | null; contentBase64: string } }>(
      `/finance/attachments/${attachmentId}/content`
    ),
  deleteAttachment: (attachmentId: string) =>
    request(`/finance/attachments/${attachmentId}`, { method: 'DELETE' }),
  createCustomRole: (body: { name: string; permissionCodes: string[]; churchId?: string }) =>
    request<{ data: { roleId: string } }>('/admin/roles', { method: 'POST', body: JSON.stringify(body) }),
  updateCustomRole: (roleId: string, body: { name?: string; permissionCodes?: string[] }) =>
    request(`/admin/roles/${roleId}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteCustomRole: (roleId: string) =>
    request(`/admin/roles/${roleId}`, { method: 'DELETE' }),
  getTrash: () => request<{ data: Operation[] }>('/finance/trash'),
  restoreOperation: (id: string) =>
    request(`/finance/operations/${id}/restore`, { method: 'POST', body: '{}' }),
  getSynthesisCategories: (params?: { dateFrom?: string; dateTo?: string }) => {
    const q = new URLSearchParams(params as Record<string, string>).toString();
    return request<{ data: SynthesisCategory[] }>(`/finance/reports/synthesis/categories${q ? `?${q}` : ''}`);
  },
  getSynthesisPeriod: (dateFrom: string, dateTo: string) =>
    request<{ data: SynthesisBlock }>(
      `/finance/reports/synthesis/period?dateFrom=${dateFrom}&dateTo=${dateTo}`
    ),
  getAudit: (params?: { limit?: number; action?: string; entityType?: string; dateFrom?: string; dateTo?: string; actorUserId?: string }) => {
    const q = new URLSearchParams(params as Record<string, string>).toString();
    return request<{ data: AuditEntry[] }>(`/finance/audit${q ? `?${q}` : ''}`);
  },
  createCategory: (body: { name: string; parentId?: string | null }) =>
    request('/finance/categories', { method: 'POST', body: JSON.stringify(body) }),
  updateCategory: (id: string, body: { name?: string; parentId?: string | null; sortOrder?: number; status?: string }) =>
    request(`/finance/categories/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteCategory: (id: string, reason: string) =>
    request(`/finance/categories/${id}`, { method: 'DELETE', body: JSON.stringify({ reason }) }),
  createFund: (name: string) =>
    request('/finance/funds', { method: 'POST', body: JSON.stringify({ name }) }),
  updateFund: (id: string, body: { name?: string; sortOrder?: number; status?: string }) =>
    request(`/finance/funds/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteFund: (id: string, reason: string) =>
    request(`/finance/funds/${id}`, { method: 'DELETE', body: JSON.stringify({ reason }) }),
  getChurches: () => request<{ data: Church[] }>('/admin/churches'),
  createChurch: (name: string) =>
    request('/admin/churches', { method: 'POST', body: JSON.stringify({ name }) }),
  updateChurch: (id: string, body: { name?: string; status?: string; fundsEnabled?: boolean }) =>
    request<{ ok: boolean; data: Church }>(`/admin/churches/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  updateChurchSettings: (body: { fundsEnabled: boolean }) =>
    request<{ ok: boolean; data: { fundsEnabled: boolean } }>('/admin/church-settings', {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  getUsers: () => request<{ data: AppUser[] }>('/admin/users'),
  getRoles: () => request<{ data: Role[] }>('/admin/roles'),
  getUserAdminOptions: () =>
    request<{ data: UserAdminOptions }>('/admin/user-options'),
  getUserAccess: (userId: string) => request<{ data: UserAccessProfile }>(`/admin/user-access/${userId}`),
  setUserAccess: (userId: string, assignments: UserAccessAssignmentInput[]) =>
    request<{ data: UserAccessProfile }>(`/admin/user-access/${userId}`, {
      method: 'PUT',
      body: JSON.stringify({ assignments }),
    }),
  createUser: (body: CreateUserBody) =>
    request('/admin/users', { method: 'POST', body: JSON.stringify(body) }),
  updateUser: (id: string, body: { isActive?: boolean; password?: string }) =>
    request(`/admin/users/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  changePassword: (currentPassword: string, newPassword: string) =>
    request('/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    }),
  getEvents: () => request<{ data: ChurchEvent[] }>('/finance/events'),
  createEvent: (body: { eventType: string; title: string; eventDate: string }) =>
    request('/finance/events', { method: 'POST', body: JSON.stringify(body) }),
  getEnvelopes: (filters?: {
    q?: string;
    dateFrom?: string;
    dateTo?: string;
    categoryId?: string;
    fundId?: string;
    amountMin?: string;
    amountMax?: string;
  }) => {
    const q = new URLSearchParams(filters as Record<string, string>).toString();
    return request<{ data: Envelope[] }>(`/finance/envelopes${q ? `?${q}` : ''}`);
  },
  createEnvelope: (body: CreateEnvelopeBody) =>
    request<{ data: { envelopeId: string; envelopeNumber: string } }>('/finance/envelopes', { method: 'POST', body: JSON.stringify(body) }),
  getPledges: () => request<{ data: Pledge[] }>('/finance/pledges'),
  createPledge: (body: CreatePledgeBody) =>
    request('/finance/pledges', { method: 'POST', body: JSON.stringify(body) }),
  addPledgePayment: (pledgeId: string, body: PledgePaymentBody) =>
    request(`/finance/pledges/${pledgeId}/payments`, { method: 'POST', body: JSON.stringify(body) }),
  getPledgeBalance: (pledgeId: string) =>
    request<{ data: PledgeBalance }>(`/finance/pledges/${pledgeId}/balance`),
  getPledgePayments: (pledgeId: string) =>
    request<{ data: PledgePayment[] }>(`/finance/pledges/${pledgeId}/payments`),
  getCountingSessions: () => request<{ data: CountingSession[] }>('/finance/counting-sessions'),
  openCountingSession: (body: { countingDate: string; teamName: string }) =>
    request<{ data: { countingSessionId: string } }>('/finance/counting-sessions', { method: 'POST', body: JSON.stringify(body) }),
  addCountingLine: (sessionId: string, body: { categoryId: string; fundId?: string | null; amountCdf: string; amountUsd?: string }) =>
    request(`/finance/counting-sessions/${sessionId}/lines`, { method: 'POST', body: JSON.stringify(body) }),
  validateCountingSession: (sessionId: string) =>
    request(`/finance/counting-sessions/${sessionId}/validate`, { method: 'POST', body: '{}' }),
  getCashBoxes: () => request<{ data: CashBox[] }>('/finance/cash-boxes'),
  getCashSessions: () => request<{ data: CashSession[] }>('/finance/cash-sessions'),
  openCashSession: (body: { cashBoxId: string; openDate: string; openingBalanceCdf: string; openingBalanceUsd?: string }) =>
    request('/finance/cash-sessions/open', { method: 'POST', body: JSON.stringify(body) }),
  closeCashSession: (sessionId: string, body: { closingBalanceCdf: string; closingBalanceUsd?: string; notes?: string }) =>
    request(`/finance/cash-sessions/${sessionId}/close`, { method: 'POST', body: JSON.stringify(body) }),
  createCashTransaction: (sessionId: string, body: CreateCashTxBody) =>
    request<{ data: { cashTransactionId: string; pieceNumber: string } }>(
      `/finance/cash-sessions/${sessionId}/transactions`,
      { method: 'POST', body: JSON.stringify(body) }
    ),
  getCashTransactions: (sessionId: string) =>
    request<{ data: CashTransaction[] }>(`/finance/cash-sessions/${sessionId}/transactions`),
  getBankAccounts: () => request<{ data: BankAccount[] }>('/finance/bank-accounts'),
  createBankAccount: (body: { name: string; iban?: string; swift?: string; currencyCode?: string }) =>
    request('/finance/bank-accounts', { method: 'POST', body: JSON.stringify(body) }),
  createBankTransaction: (body: CreateBankTxBody) =>
    request<{ data: { pieceNumber?: string; operationId?: string; from?: { pieceNumber: string }; to?: { pieceNumber: string } } }>(
      '/finance/bank-transactions',
      { method: 'POST', body: JSON.stringify(body) }
    ),
  getBankReconciliations: () => request<{ data: BankReconciliation[] }>('/finance/bank-reconciliations'),
  createBankReconciliation: (body: { bankAccountId: string; reconciliationDate: string; notes?: string }) =>
    request<{ data: { bankReconciliationId: string } }>('/finance/bank-reconciliations', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  validateBankReconciliation: (id: string) =>
    request(`/finance/bank-reconciliations/${id}/validate`, { method: 'POST', body: '{}' }),
  getBankTransactions: (bankAccountId: string, limit?: number) => {
    const q = new URLSearchParams({ bankAccountId, ...(limit ? { limit: String(limit) } : {}) }).toString();
    return request<{ data: BankTransactionRow[] }>(`/finance/bank-transactions?${q}`);
  },
  getReconciliationMatches: (reconciliationId: string) =>
    request<{ data: BankReconciliationMatch[] }>(`/finance/bank-reconciliations/${reconciliationId}/matches`),
  addReconciliationMatch: (
    reconciliationId: string,
    body: { bankTransactionId?: string | null; externalStatementLineRef: string; matchedAmountCdf: string }
  ) =>
    request<{ data: { matchId: string } }>(`/finance/bank-reconciliations/${reconciliationId}/matches`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  getBudgets: () => request<{ data: Budget[] }>('/finance/budgets'),
  createBudget: (body: CreateBudgetBody) =>
    request('/finance/budgets', { method: 'POST', body: JSON.stringify(body) }),
  upsertBudgetLine: (budgetId: string, body: BudgetLineBody) =>
    request(`/finance/budgets/${budgetId}/lines`, { method: 'POST', body: JSON.stringify(body) }),
  getBudgetExecution: (budgetId: string) =>
    request<{ data: BudgetExecutionItem[] }>(`/finance/budgets/${budgetId}/execution`),
  getClosures: () => request<{ data: FinancialClosure[] }>('/finance/closures'),
  createClosure: (body: CreateClosureBody) =>
    request('/finance/closures', { method: 'POST', body: JSON.stringify(body) }),
  getPastoralDashboard: () => request<{ data: PastoralDashboardData }>('/finance/dashboard/pastoral'),
  updateOperation: (id: string, patch: Partial<CreateOperationBody & { beneficiary?: string; observation?: string }>) =>
    request(`/finance/operations/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  getSystemLocal: () => request<{ data: SystemLocalInfo }>('/system/local'),
  getCloudStatus: () => request<{ data: CloudStatusData }>('/system/cloud'),
  updateCloudConfig: (body: { remoteUrl: string; publicLabel?: string; notes?: string }) =>
    request<{ data: CloudConfigData }>('/system/cloud', { method: 'PUT', body: JSON.stringify(body) }),
  testRemoteCloud: (url?: string) =>
    request<{ data: RemoteHealthResult }>('/system/cloud/test-remote', {
      method: 'POST',
      body: JSON.stringify(url ? { url } : {}),
    }),
  createSystemBackup: () =>
    request<{ data: SystemBackupResult }>('/system/backup', { method: 'POST', body: '{}' }),
  exportPortableData: (targetPath: string) =>
    request<{ data: PortableExportResult }>('/system/portable/export', {
      method: 'POST',
      body: JSON.stringify({ targetPath }),
    }),
  validatePortableData: (sourcePath: string) =>
    request<{ data: PortableValidationResult }>('/system/portable/validate', {
      method: 'POST',
      body: JSON.stringify({ sourcePath }),
    }),
  importPortableData: (sourcePath: string) =>
    request<{ data: PortableImportResult }>('/system/portable/import', {
      method: 'POST',
      body: JSON.stringify({ sourcePath }),
    }),
  getSystemDrives: () => request<{ data: string[] }>('/system/drives'),
  browseSystemFolder: (initialPath?: string) =>
    request<{ data: { path: string | null } }>('/system/browse-folder', {
      method: 'POST',
      body: JSON.stringify(initialPath ? { initialPath } : {}),
    }),
  pushCloudSync: () => request<{ data: SyncPushResult }>('/system/sync/push', { method: 'POST', body: '{}' }),
  getSyncConflicts: () => request<{ data: SyncConflictEvent[] }>('/system/sync/conflicts'),
  retrySyncConflict: (id: string) =>
    request<{ data: { ok: boolean; reason?: string } }>(`/system/sync/conflicts/${id}/retry`, {
      method: 'POST',
      body: '{}',
    }),
  dismissSyncConflict: (id: string) =>
    request(`/system/sync/conflicts/${id}/dismiss`, { method: 'POST', body: '{}' }),
  getMembers: (params?: { q?: string; status?: string }) => {
    const q = new URLSearchParams(params as Record<string, string>).toString();
    return request<{ data: ChurchMember[] }>(`/pastoral/members${q ? `?${q}` : ''}`);
  },
  createMember: (body: CreateMemberBody) =>
    request<{ data: { memberId: string } }>('/pastoral/members', { method: 'POST', body: JSON.stringify(body) }),
  updateMember: (id: string, patch: Partial<CreateMemberBody & { status?: string }>) =>
    request(`/pastoral/members/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  deleteMember: (id: string) =>
    request(`/pastoral/members/${id}/delete`, { method: 'POST', body: '{}' }),
  getPastoralMembersDashboard: () => request<{ data: PastoralMembersDashboard }>('/pastoral/dashboard'),
  getCells: () => request<{ data: PastoralCell[] }>('/pastoral/cells'),
  createCell: (body: CreateCellBody) =>
    request<{ data: { cellId: string } }>('/pastoral/cells', { method: 'POST', body: JSON.stringify(body) }),
  getVisits: (params?: { dateFrom?: string; dateTo?: string }) => {
    const q = new URLSearchParams(params as Record<string, string>).toString();
    return request<{ data: PastoralVisit[] }>(`/pastoral/visits${q ? `?${q}` : ''}`);
  },
  createVisit: (body: CreateVisitBody) =>
    request<{ data: { visitId: string } }>('/pastoral/visits', { method: 'POST', body: JSON.stringify(body) }),
  getTrainings: () => request<{ data: PastoralTraining[] }>('/pastoral/trainings'),
  createTraining: (body: CreateTrainingBody) =>
    request<{ data: { trainingId: string } }>('/pastoral/trainings', { method: 'POST', body: JSON.stringify(body) }),
  getOAuthProviders: () => request<{ data: string[] }>('/oauth/providers'),
  getNotifications: () => request<{ data: AppNotification[] }>('/system/notifications'),
  markNotificationRead: (id: string) =>
    request(`/system/notifications/${id}/read`, { method: 'POST', body: '{}' }),
  getPortableHistory: () => request<{ data: PortableExportLogEntry[] }>('/system/portable/history'),
  getAppVersion: () => request<{ data: AppVersionInfo }>('/system/version'),
};

export type DeploymentInfo = {
  deploymentMode: 'local-desktop' | 'cloud-server';
  servesWebUi: boolean;
  networkAccessible: boolean;
  publicUrl: string | null;
  httpsEnabled: boolean;
  domain: string | null;
};

export type CloudConfigData = {
  remoteUrl: string;
  publicLabel?: string;
  notes?: string;
  lastRemoteCheckAt?: string;
  lastRemoteCheckOk?: boolean;
  updatedAt?: string;
};

export type SystemLocalInfo = {
  mode: string;
  description: string;
  dataDir: string;
  databaseFile: string;
  databaseExists: boolean;
  databaseBytes: number;
  activeUsers: number;
  pendingSyncEvents?: number;
  autoBackupEnabled?: boolean;
  installRoot?: string | null;
  configDir?: string;
  portableFolderName?: string;
  host: string;
  port: number;
  deployment: DeploymentInfo;
};

export type CloudStatusData = {
  config: CloudConfigData;
  deployment: DeploymentInfo;
  backups: {
    directory: string;
    count: number;
    latestFile: string | null;
  };
  pendingSyncEvents?: number;
  syncConflicts?: number;
  autoBackupEnabled?: boolean;
};

export type CloudPageData = CloudStatusData & {
  local: SystemLocalInfo;
};

export type RemoteHealthResult = {
  url: string;
  ok: boolean;
  latencyMs: number;
  message: string;
  status?: string;
};

export type SystemBackupResult = {
  fileName: string;
  path: string;
  bytes: number;
  createdAt: string;
};

export type PortableExportResult = {
  packagePath: string;
  bytes: number;
  folderName: string;
};

export type PortableValidationResult = {
  ok: boolean;
  errors: string[];
  manifest?: { format: string; exportedAt: string; appVersion: string; churchName?: string };
};

export type PortableImportResult = {
  scheduled: boolean;
  requiresRestart: boolean;
  message: string;
};

export type SyncPushResult = {
  ok: boolean;
  pushed: number;
  message: string;
  remoteUrl?: string;
};

export type SyncConflictEvent = {
  event_id: string;
  church_id: string;
  entity_type: string;
  operation: string;
  entity_id: string;
  payload_json: string;
  created_at: string;
  sync_status: string;
};

export type ChurchMember = {
  member_id: string;
  church_id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  birth_date: string | null;
  gender: string | null;
  status: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type CreateMemberBody = {
  fullName: string;
  phone?: string;
  email?: string;
  birthDate?: string;
  gender?: string;
  notes?: string;
};

export type PastoralMembersDashboard = {
  totalMembers: number;
  recentMembers: ChurchMember[];
  cellsCount?: number;
  visitsThisMonth?: number;
  upcomingTrainings?: PastoralTraining[];
};

export type PastoralCell = {
  cell_id: string;
  name: string;
  meeting_day: string | null;
  meeting_time: string | null;
  location: string | null;
  status: string;
};

export type CreateCellBody = {
  name: string;
  leaderMemberId?: string;
  meetingDay?: string;
  meetingTime?: string;
  location?: string;
  notes?: string;
};

export type PastoralVisit = {
  visit_id: string;
  visitor_name: string;
  visit_date: string;
  visit_type: string;
  notes: string | null;
};

export type CreateVisitBody = {
  visitorName: string;
  visitDate: string;
  visitType?: string;
  memberId?: string;
  notes?: string;
};

export type PastoralTraining = {
  training_id: string;
  title: string;
  training_date: string;
  trainer: string | null;
  location: string | null;
  description?: string | null;
};

export type CreateTrainingBody = {
  title: string;
  trainingDate: string;
  trainer?: string;
  location?: string;
  description?: string;
};

export type AppNotification = {
  id: string;
  severity: 'info' | 'warning' | 'danger';
  title: string;
  message: string;
  createdAt: string;
  read: boolean;
};

export type PortableExportLogEntry = {
  id: string;
  at: string;
  direction: 'export' | 'import';
  packagePath: string;
  bytes?: number;
};

export type AppVersionInfo = {
  current: string;
  updateUrl: string | null;
  sqlCipherEnabled: boolean;
};

export type TauxDuJour = {
  exchangeRateId: string;
  effectiveDate: string;
  baseCurrency: string;
  quoteCurrency: string;
  display: string;
  inverseDisplay: string;
  rateValue: string;
};

export type RateHistoryItem = {
  exchangeRateId: string;
  baseCurrency: string;
  quoteCurrency: string;
  effectiveDate: string;
  display: string;
};

export type SetRateBody = {
  effectiveDate: string;
  baseCurrency: 'USD' | 'CDF' | 'EUR' | 'GBP';
  quoteCurrency: 'USD' | 'CDF' | 'EUR' | 'GBP';
  rateValue: string;
};

export type Category = {
  category_id: string;
  name: string;
  status: string;
  sort_order: number;
  parent_id?: string | null;
};

export type Fund = {
  fund_id: string;
  name: string;
  status: string;
  balanceUsdMicro: string;
};

export type Operation = {
  operation_id: string;
  op_date: string;
  piece_number: string;
  piece_type: string;
  label: string;
  beneficiary: string | null;
  category_name?: string;
  fund_id?: string | null;
  fund_name?: string | null;
  event_title?: string | null;
  created_by_name?: string | null;
  receipts_cdf: string;
  receipts_usd_converted: string;
  receipts_usd: string;
  expenses_cdf: string;
  expenses_usd_converted: string;
  expenses_usd: string;
  usd_rate_quote_per_1_usd: string | null;
  observation: string | null;
  created_at: string;
  updated_at?: string;
  deletion_reason?: string;
  is_locked_by_closure?: number;
};

export type OperationAttachment = {
  attachment_id: string;
  operation_id: string;
  file_name: string;
  mime_type: string | null;
  size_bytes: number | null;
  created_at: string;
};

export type CreateOperationBody = {
  pieceType: 'REC' | 'DEP' | 'CAI' | 'BAN';
  opDate: string;
  label: string;
  beneficiary?: string;
  categoryId: string;
  fundId?: string | null;
  eventId?: string;
  receiptsCdf: string;
  receiptsUsd?: string;
  expensesCdf: string;
  expensesUsd: string;
  observation?: string;
};

export type SynthesisRubrique = {
  categoryId: string;
  name: string;
  recettesUsd: string;
  depensesUsd: string;
  soldeUsd: string;
};

export type SynthesisBlock = {
  dateFrom: string;
  dateTo: string;
  recettesUsd: string;
  depensesUsd: string;
  soldeUsd: string;
  nombreOperations: number;
  rubriques: SynthesisRubrique[];
};

export type TendanceMensuelle = {
  mois: string;
  recettesUsd: string;
  depensesUsd: string;
};

export type SyntheseFonds = {
  fundId: string;
  name: string;
  recettesUsd: string;
  depensesUsd: string;
  soldeUsd: string;
};

export type PeriodComparisonSide = {
  label: string;
  dateFrom: string;
  dateTo: string;
  recettesUsd: string;
  depensesUsd: string;
  soldeUsd: string;
};

export type PeriodComparison = {
  periodeCourante: PeriodComparisonSide;
  periodePrecedente: PeriodComparisonSide;
};

export type DashboardData = {
  soldeGlobalUsd: string;
  recettesTotalesUsd?: string;
  depensesTotalesUsd: string;
  tendanceMensuelle?: TendanceMensuelle[];
  syntheseFonds?: SyntheseFonds[];
  syntheseRubriques?: SynthesisRubrique[];
  comparaisonMensuelle?: PeriodComparison;
  comparaisonAnnuelle?: PeriodComparison;
  syntheses?: {
    journaliere: SynthesisBlock;
    hebdomadaire: SynthesisBlock;
    mensuelle: SynthesisBlock;
    annuelle: SynthesisBlock;
  };
  recettesJourUsd: string;
  depensesJourUsd: string;
  recettesMoisUsd: string;
  depensesMoisUsd: string;
  soldeMoisUsd: string;
  nombreOperations: number;
  dernieresOperations: Operation[];
};

export type PastoralDashboardData = {
  soldeGlobalUsd: string;
  recettesTotalesUsd: string;
  depensesTotalesUsd: string;
  recettesMoisUsd: string;
  depensesMoisUsd: string;
  soldeMoisUsd: string;
  nombreOperations: number;
  syntheseFonds: SyntheseFonds[];
  syntheseRubriques: SynthesisRubrique[];
  tendanceMensuelle: TendanceMensuelle[];
  syntheses?: {
    journaliere: SynthesisBlock;
    hebdomadaire: SynthesisBlock;
    mensuelle: SynthesisBlock;
    annuelle: SynthesisBlock;
  };
};

export type ChurchEvent = {
  event_id: string;
  event_type: string;
  title: string;
  event_date: string;
  created_at: string;
};

export type Envelope = {
  envelope_id: string;
  envelope_number: string;
  follower: string;
  envelope_date: string;
  category_id: string;
  fund_id: string;
  amount_cdf: string;
  amount_usd_converted: string;
  amount_usd: string;
  observation: string | null;
};

export type Pledge = {
  pledge_id: string;
  follower: string;
  pledge_amount_cdf: string;
  pledge_amount_usd_converted: string;
  pledge_amount_usd: string;
  start_date: string | null;
  end_date: string | null;
  verse_cdf: number;
  verse_usd: number;
  created_at: string;
};

export type PledgeBalance = {
  follower: string;
  montantPromisCdf: string;
  montantVerseCdf: string;
  soldeRestantCdf: string;
  montantPromisUsd: string;
  montantVerseUsd: string;
  soldeRestantUsd: string;
};

export type CreateCashTxBody = {
  txDate: string;
  label: string;
  categoryId: string;
  fundId?: string | null;
  receiptsCdf?: string;
  receiptsUsd?: string;
  expensesCdf?: string;
  expensesUsd?: string;
  observation?: string;
};

export type CashTransaction = {
  cash_transaction_id: string;
  piece_number: string;
  op_date: string;
  label: string;
  receipts_cdf: string;
  receipts_usd: string;
  expenses_cdf: string;
  expenses_usd: string;
};

export type BankReconciliation = {
  bank_reconciliation_id: string;
  bank_account_id: string;
  bank_account_name: string;
  reconciliation_date: string;
  status: string;
  opened_at: string;
  notes: string | null;
};

export type BankTransactionRow = {
  bank_transaction_id: string;
  piece_number: string;
  tx_date: string;
  label: string;
  beneficiary: string | null;
  receipts_cdf: string;
  expenses_cdf: string;
  receipts_usd: string;
  expenses_usd: string;
  external_reference: string | null;
};

export type BankReconciliationMatch = {
  match_id: string;
  bank_reconciliation_id: string;
  bank_transaction_id: string | null;
  external_statement_line_ref: string;
  matched_amount_cdf: string;
  created_at: string;
  piece_number?: string;
  tx_date?: string;
  label?: string;
};

export type PledgePayment = {
  payment_id: string;
  payment_date: string;
  amount_cdf: string;
  amount_usd: string;
  observation: string | null;
  created_at: string;
};

export type CreatePledgeBody = {
  follower: string;
  pledgeAmountCdf: string;
  pledgeAmountUsd?: string;
  startDate?: string;
  endDate?: string;
};

export type PledgePaymentBody = {
  paymentDate: string;
  amountCdf: string;
  amountUsd?: string;
  categoryId: string;
  fundId?: string | null;
  observation?: string;
};

export type CreateEnvelopeBody = {
  follower: string;
  envelopeDate: string;
  categoryId: string;
  fundId?: string | null;
  amountCdf: string;
  amountUsd?: string;
  observation?: string;
  eventId?: string;
};

export type CountingSession = {
  counting_session_id: string;
  counting_date: string;
  team_name: string;
  status: string;
  nb_lignes: number;
  total_cdf: number;
  total_usd: number;
  created_at: string;
};

export type CashBox = {
  cash_box_id: string;
  name: string;
  is_active: number;
};

export type CashSession = {
  cash_session_id: string;
  cash_box_id: string;
  open_date: string;
  close_date: string | null;
  opening_balance_cdf: string;
  opening_balance_usd: string;
  closing_balance_cdf: string | null;
  closing_balance_usd: string | null;
  status: string;
  opened_at: string;
  closed_at: string | null;
};

export type BankAccount = {
  bank_account_id: string;
  name: string;
  iban: string | null;
  swift: string | null;
  currency_code: string;
  is_active: number;
};

export type CreateBankTxBody = {
  kind: 'DEPOT' | 'RETRAIT' | 'VIREMENT';
  bankAccountId: string;
  toBankAccountId?: string;
  txDate: string;
  label: string;
  beneficiary?: string;
  categoryId: string;
  fundId?: string | null;
  eventId?: string;
  amountCdf: string;
  amountUsd?: string;
  externalReference?: string;
  observation?: string;
};

export type Budget = {
  budget_id: string;
  budget_type: string;
  period_start: string;
  period_end: string;
  fiscal_year: number | null;
  created_at: string;
};

export type CreateBudgetBody = {
  budgetType: 'ANNUAL' | 'SEMIANNUAL' | 'QUARTERLY' | 'MONTHLY';
  periodStart: string;
  periodEnd: string;
  fiscalYear?: number;
};

export type BudgetLineBody = {
  categoryId: string;
  fundId?: string;
  plannedReceiptsUsd: string;
  plannedExpensesUsd: string;
};

export type BudgetExecutionSlice = {
  plannedUsdMicro: string;
  actualUsdMicro: string;
  ecartUsdMicro: string;
  tauxExecutionPercent: number;
};

export type BudgetExecutionItem = {
  budgetLineId: string;
  categoryId: string;
  fundId: string | null;
  plannedReceiptsUsdMicro: string;
  actualReceiptsUsdMicro: string;
  receiptsExecution: BudgetExecutionSlice;
  plannedExpensesUsdMicro: string;
  actualExpensesUsdMicro: string;
  expensesExecution: BudgetExecutionSlice;
};

export type FinancialClosure = {
  closure_id: string;
  closure_type: string;
  period_start: string;
  period_end: string;
  status: string;
  notes: string | null;
  closed_at: string;
};

export type CreateClosureBody = {
  closureType: 'MONTH' | 'QUARTER' | 'YEAR';
  periodStart: string;
  periodEnd: string;
  notes?: string;
};

export type SynthesisCategory = {
  categoryId: string;
  name: string;
  recettesUsd: string;
  depensesUsd: string;
  soldeUsd: string;
};

export type AuditEntry = {
  audit_id: string;
  entity_type: string;
  entity_id: string;
  action: string;
  actor_user_id: string;
  changed_at: string;
};

export type Church = {
  church_id: string;
  name: string;
  status: string;
  funds_enabled: number;
  created_at: string;
  updated_at: string;
};

export type AppUser = {
  user_id: string;
  email: string | null;
  full_name: string;
  is_active: number;
  roles: string;
  churches?: string;
  created_at: string;
};

export type Permission = {
  permission_id: string;
  code: string;
};

export type UserAccessAssignmentInput = {
  churchId: string;
  roleIds: string[];
  permissionCodes?: string[];
};

export type UserAccessAssignment = UserAccessAssignmentInput & {
  churchName: string;
  membershipStatus: string;
  roleNames: string[];
  permissionCodes: string[];
  customPermissions: boolean;
};

export type UserAdminOptions = {
  churches: Church[];
  roles: Role[];
  permissions: Permission[];
  rolePermissions: Record<string, string[]>;
};

export type UserAccessProfile = {
  userId: string;
  email: string | null;
  fullName: string;
  isActive: boolean;
  assignments: UserAccessAssignment[];
};

export type Role = {
  role_id: string;
  name: string;
  is_system_role: number;
};

export type CreateUserBody = {
  email: string;
  fullName: string;
  password: string;
  roleId?: string;
  assignments?: UserAccessAssignmentInput[];
};
