import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import fs from 'node:fs';
import { getAppContext } from '../appContext';
import { requireAuth, requireAnyPermission, requirePermission, type RequestWithAuth } from '../middleware/auth';
import { businessErrorMessage } from '../jsonSafe';
import { operationsToCsv } from '../exportOperationsCsv';

export async function financeRoutes(app: FastifyInstance): Promise<void> {
  const { finance } = getAppContext();

  app.addHook('onRoute', (routeOptions) => {
    const methods = routeOptions.method;
    const isMutating =
      typeof methods === 'string'
        ? methods !== 'GET' && methods !== 'HEAD'
        : Array.isArray(methods) && methods.some((m) => m !== 'GET' && m !== 'HEAD');
    if (!isMutating || !routeOptions.handler) return;

    const original = routeOptions.handler;
    routeOptions.handler = async function financeSafeHandler(
      this: unknown,
      request: FastifyRequest,
      reply: FastifyReply
    ) {
      try {
        return await (original as (req: FastifyRequest, reply: FastifyReply) => Promise<unknown>).call(
          this,
          request,
          reply
        );
      } catch (err) {
        return reply.status(400).send({ error: businessErrorMessage(err) });
      }
    };
  });

  app.addHook('preHandler', requireAuth);

  const ctx = (req: FastifyRequest) => (req as RequestWithAuth).tenant;

  const perm = {
    ops: requirePermission('finance:operations:voir'),
    reports: requirePermission('finance:reports:voir'),
    rates: requireAnyPermission('finance:operations:voir', 'finance:exchange-rates:modifier', 'finance:reports:voir'),
    restore: requirePermission('finance:operations:restaurer'),
  };

  // ─── TAUX DE CHANGE ───────────────────────────────────────────────────
  app.get('/finance/exchange-rates/today', { preHandler: perm.rates }, async (req) => {
    return { data: finance.getTauxDuJour(ctx(req)) };
  });

  app.get('/finance/exchange-rates/history', { preHandler: perm.rates }, async (req) => {
    const limit = Number((req.query as { limit?: string }).limit ?? 50);
    return { data: finance.listExchangeRateHistory(ctx(req), limit) };
  });

  app.post('/finance/exchange-rates', { preHandler: requirePermission('finance:exchange-rates:modifier') }, async (req) => {
    const body = req.body as {
      effectiveDate: string;
      baseCurrency: 'USD' | 'CDF';
      quoteCurrency: 'USD' | 'CDF';
      rateValue: string;
    };
    const result = await finance.setExchangeRate({ ctx: ctx(req), ...body });
    return { data: result };
  });

  // ─── RUBRIQUES & FONDS ────────────────────────────────────────────────
  app.get('/finance/categories', { preHandler: perm.ops }, async (req) => {
    return { data: finance.categories.list(ctx(req)) };
  });

  app.post('/finance/categories', { preHandler: requirePermission('finance:operations:ajouter') }, async (req) => {
    const body = req.body as { name: string; parentId?: string; sortOrder?: number };
    const id = finance.categories.create({ ctx: ctx(req), ...body });
    return { data: { categoryId: id } };
  });

  app.patch('/finance/categories/:id', { preHandler: requirePermission('finance:operations:modifier') }, async (req) => {
    const { id } = req.params as { id: string };
    const body = req.body as { name?: string; parentId?: string | null; sortOrder?: number; status?: string };
    finance.categories.update({ ctx: ctx(req), categoryId: id, ...body });
    return { ok: true };
  });

  app.delete('/finance/categories/:id', { preHandler: requirePermission('finance:operations:supprimer') }, async (req) => {
    const { id } = req.params as { id: string };
    const { reason } = req.body as { reason: string };
    finance.categories.softDelete({ ctx: ctx(req), categoryId: id, reason });
    return { ok: true };
  });

  app.get('/finance/funds', { preHandler: perm.ops }, async (req) => {
    const funds = finance.funds.list(ctx(req));
    const withBalance = funds.map((f) => ({
      ...f,
      balanceUsdMicro: finance.funds.getBalanceUsdMicro({ ctx: ctx(req), fundId: f.fund_id }).toString(),
    }));
    return { data: withBalance };
  });

  app.post('/finance/funds', { preHandler: requirePermission('finance:operations:ajouter') }, async (req) => {
    const body = req.body as { name: string; sortOrder?: number };
    const id = finance.funds.create({ ctx: ctx(req), ...body });
    return { data: { fundId: id } };
  });

  app.patch('/finance/funds/:id', { preHandler: requirePermission('finance:operations:modifier') }, async (req) => {
    const { id } = req.params as { id: string };
    const body = req.body as { name?: string; sortOrder?: number; status?: string };
    finance.funds.update({ ctx: ctx(req), fundId: id, ...body });
    return { ok: true };
  });

  app.delete('/finance/funds/:id', { preHandler: requirePermission('finance:operations:supprimer') }, async (req) => {
    const { id } = req.params as { id: string };
    const { reason } = req.body as { reason: string };
    finance.funds.softDelete({ ctx: ctx(req), fundId: id, reason });
    return { ok: true };
  });

  // ─── ÉVÉNEMENTS ───────────────────────────────────────────────────────
  app.get('/finance/events', { preHandler: perm.ops }, async (req) => {
    return { data: finance.events.list(ctx(req)) };
  });

  app.post('/finance/events', { preHandler: requirePermission('finance:operations:ajouter') }, async (req) => {
    const body = req.body as { eventType: string; title: string; eventDate: string };
    const id = finance.events.create({ ctx: ctx(req), ...body });
    return { data: { eventId: id } };
  });

  // ─── OPÉRATIONS ───────────────────────────────────────────────────────
  app.get('/finance/operations', { preHandler: perm.ops }, async (req) => {
    const q = req.query as { dateFrom?: string; dateTo?: string; fundId?: string };
    return { data: finance.listOperations(ctx(req), q) };
  });

  app.get('/finance/operations/export.csv', { preHandler: perm.ops }, async (req, reply) => {
    const q = req.query as { dateFrom?: string; dateTo?: string; fundId?: string };
    const rows = finance.listOperations(ctx(req), q);
    const csv = operationsToCsv(rows);
    return reply
      .header('Content-Type', 'text/csv; charset=utf-8')
      .header('Content-Disposition', 'attachment; filename="operations.csv"')
      .send('\uFEFF' + csv);
  });

  app.post('/finance/operations', { preHandler: requirePermission('finance:operations:ajouter') }, async (req) => {
    const body = req.body as {
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
    const result = await finance.createOperation({ ctx: ctx(req), ...body });
    return { data: { operationId: result.operationId, pieceNumber: result.pieceNumber } };
  });

  app.patch('/finance/operations/:id', { preHandler: requirePermission('finance:operations:modifier') }, async (req) => {
    const { id } = req.params as { id: string };
    const patch = req.body as Record<string, unknown>;
    await finance.updateOperation({ ctx: ctx(req), operationId: id, patch });
    return { ok: true };
  });

  app.post('/finance/operations/:id/delete', { preHandler: requirePermission('finance:operations:supprimer') }, async (req) => {
    const { id } = req.params as { id: string };
    const { reason } = req.body as { reason: string };
    await finance.deleteOperation({ ctx: ctx(req), operationId: id, reason });
    return { ok: true };
  });

  app.post('/finance/operations/:id/restore', {
    preHandler: perm.restore,
  }, async (req) => {
    const { id } = req.params as { id: string };
    await finance.restoreOperation({ ctx: ctx(req), operationId: id });
    return { ok: true };
  });

  app.get('/finance/trash', { preHandler: perm.restore }, async (req) => {
    return { data: finance.listTrash(ctx(req)) };
  });

  // ─── PIÈCES JUSTIFICATIVES ────────────────────────────────────────────
  app.get('/finance/operations/:id/attachments', { preHandler: perm.ops }, async (req) => {
    const { id } = req.params as { id: string };
    return { data: finance.attachments.listByOperation(ctx(req), id) };
  });

  app.post('/finance/operations/:id/attachments', {
    preHandler: requirePermission('finance:operations:modifier'),
  }, async (req) => {
    const { id } = req.params as { id: string };
    const body = req.body as { fileName: string; mimeType?: string; contentBase64: string };
    const attachmentId = finance.attachments.add({
      ctx: ctx(req),
      operationId: id,
      fileName: body.fileName,
      mimeType: body.mimeType,
      contentBase64: body.contentBase64,
    });
    return { data: { attachmentId } };
  });

  app.get('/finance/attachments/:id/content', { preHandler: perm.ops }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const found = finance.attachments.getFilePath(ctx(req), id);
    if (!found) return reply.status(404).send({ error: 'Fichier introuvable' });
    const contentBase64 = fs.readFileSync(found.absPath).toString('base64');
    return {
      data: {
        attachmentId: id,
        fileName: found.row.file_name,
        mimeType: found.row.mime_type,
        contentBase64,
      },
    };
  });

  app.delete('/finance/attachments/:id', {
    preHandler: requirePermission('finance:operations:modifier'),
  }, async (req) => {
    const { id } = req.params as { id: string };
    finance.attachments.remove(ctx(req), id);
    return { ok: true };
  });

  // ─── ENVELOPPES ───────────────────────────────────────────────────────
  app.get('/finance/envelopes', { preHandler: perm.ops }, async (req) => {
    const q = req.query as {
      q?: string;
      dateFrom?: string;
      dateTo?: string;
      categoryId?: string;
      fundId?: string;
      amountMin?: string;
      amountMax?: string;
    };
    return { data: finance.searchEnvelopes(ctx(req), q) };
  });

  app.post('/finance/envelopes', { preHandler: requirePermission('finance:operations:ajouter') }, async (req) => {
    const body = req.body as {
      follower: string;
      envelopeDate: string;
      categoryId: string;
      fundId?: string | null;
      amountCdf: string;
      amountUsd?: string;
      observation?: string;
      eventId?: string;
    };
    const result = await finance.createEnvelope({ ctx: ctx(req), ...body });
    return { data: result };
  });

  // ─── PROMESSES DE FOI ─────────────────────────────────────────────────
  app.post('/finance/pledges', { preHandler: requirePermission('finance:operations:ajouter') }, async (req) => {
    const body = req.body as {
      follower: string;
      pledgeAmountCdf: string;
      pledgeAmountUsd?: string;
      startDate?: string;
      endDate?: string;
    };
    const id = finance.createPledge({ ctx: ctx(req), ...body });
    return { data: { pledgeId: id } };
  });

  app.post('/finance/pledges/:id/payments', { preHandler: requirePermission('finance:operations:ajouter') }, async (req) => {
    const { id } = req.params as { id: string };
    const body = req.body as {
      paymentDate: string;
      amountCdf: string;
      amountUsd?: string;
      categoryId: string;
      fundId?: string | null;
      observation?: string;
    };
    const result = await finance.addPledgePayment({ ctx: ctx(req), pledgeId: id, ...body });
    return { data: result };
  });

  app.get('/finance/pledges/:id/balance', { preHandler: perm.ops }, async (req) => {
    const { id } = req.params as { id: string };
    return { data: finance.getPledgeBalance(ctx(req), id) };
  });

  // ─── COMPTAGE ─────────────────────────────────────────────────────────
  app.post('/finance/counting-sessions', { preHandler: requirePermission('finance:operations:ajouter') }, async (req) => {
    const body = req.body as { countingDate: string; teamName: string };
    const id = finance.openCountingSession({ ctx: ctx(req), ...body });
    return { data: { countingSessionId: id } };
  });

  app.post('/finance/counting-sessions/:id/lines', { preHandler: requirePermission('finance:operations:ajouter') }, async (req) => {
    const { id } = req.params as { id: string };
    const body = req.body as { categoryId: string; fundId?: string | null; amountCdf: string; amountUsd?: string };
    const lineId = finance.addCountingLine({ ctx: ctx(req), sessionId: id, ...body });
    return { data: { countingLineId: lineId } };
  });

  app.post('/finance/counting-sessions/:id/validate', { preHandler: requirePermission('finance:operations:modifier') }, async (req) => {
    const { id } = req.params as { id: string };
    await finance.validateCountingSession({ ctx: ctx(req), sessionId: id });
    return { ok: true };
  });

  // ─── CAISSE ───────────────────────────────────────────────────────────
  app.post('/finance/cash-sessions/open', { preHandler: requirePermission('finance:operations:ajouter') }, async (req) => {
    const body = req.body as { cashBoxId: string; openDate: string; openingBalanceCdf: string; openingBalanceUsd?: string };
    const id = finance.openCashSession({ ctx: ctx(req), ...body });
    return { data: { cashSessionId: id } };
  });

  app.post('/finance/cash-sessions/:id/close', { preHandler: requirePermission('finance:operations:modifier') }, async (req) => {
    const { id } = req.params as { id: string };
    const body = req.body as { closingBalanceCdf: string; closingBalanceUsd?: string; notes?: string };
    const result = finance.closeCashSession({ ctx: ctx(req), sessionId: id, ...body });
    return { data: result };
  });

  app.post('/finance/cash-sessions/:id/transactions', { preHandler: requirePermission('finance:operations:ajouter') }, async (req) => {
    const { id } = req.params as { id: string };
    const body = req.body as {
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
    const result = await finance.createCashTransaction({ ctx: ctx(req), sessionId: id, ...body });
    return { data: result };
  });

  app.get('/finance/pledges/:id/payments', { preHandler: perm.ops }, async (req) => {
    const { id } = req.params as { id: string };
    return { data: finance.listPledgePayments(ctx(req), id) };
  });

  app.get('/finance/cash-sessions/:id/transactions', { preHandler: perm.ops }, async (req) => {
    const { id } = req.params as { id: string };
    return { data: finance.listCashTransactions(ctx(req), id) };
  });

  // ─── BANQUE ───────────────────────────────────────────────────────────
  app.get('/finance/bank-accounts', { preHandler: perm.ops }, async (req) => {
    return { data: finance.listBankAccounts(ctx(req)) };
  });

  app.post('/finance/bank-accounts', { preHandler: requirePermission('finance:operations:ajouter') }, async (req) => {
    const body = req.body as { name: string; iban?: string; swift?: string; currencyCode?: string };
    const id = finance.createBankAccount({ ctx: ctx(req), ...body });
    return { data: { bankAccountId: id } };
  });

  app.post('/finance/bank-transactions', { preHandler: requirePermission('finance:operations:ajouter') }, async (req) => {
    const body = req.body as {
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
    const result = await finance.createBankTransaction({ ctx: ctx(req), ...body });
    return { data: result };
  });

  app.get('/finance/bank-transactions', { preHandler: perm.ops }, async (req) => {
    const q = req.query as { bankAccountId: string; limit?: string };
    return {
      data: finance.listBankTransactions({
        ctx: ctx(req),
        bankAccountId: q.bankAccountId,
        limit: q.limit ? Number(q.limit) : undefined,
      }),
    };
  });

  app.get('/finance/bank-reconciliations', { preHandler: perm.ops }, async (req) => {
    return { data: finance.listBankReconciliations(ctx(req)) };
  });

  app.post('/finance/bank-reconciliations', { preHandler: requirePermission('finance:operations:modifier') }, async (req) => {
    const body = req.body as { bankAccountId: string; reconciliationDate: string; notes?: string };
    const id = finance.createBankReconciliation({ ctx: ctx(req), ...body });
    return { data: { bankReconciliationId: id } };
  });

  app.post('/finance/bank-reconciliations/:id/validate', { preHandler: requirePermission('finance:operations:modifier') }, async (req) => {
    const { id } = req.params as { id: string };
    finance.validateBankReconciliation({ ctx: ctx(req), bankReconciliationId: id });
    return { ok: true };
  });

  // ─── BUDGETS ──────────────────────────────────────────────────────────
  app.post('/finance/budgets', { preHandler: requirePermission('finance:operations:ajouter') }, async (req) => {
    const body = req.body as {
      budgetType: 'ANNUAL' | 'SEMIANNUAL' | 'QUARTERLY' | 'MONTHLY';
      periodStart: string;
      periodEnd: string;
      fiscalYear?: number;
    };
    const id = finance.createBudget({ ctx: ctx(req), ...body });
    return { data: { budgetId: id } };
  });

  app.post('/finance/budgets/:id/lines', { preHandler: requirePermission('finance:operations:modifier') }, async (req) => {
    const { id } = req.params as { id: string };
    const body = req.body as {
      categoryId: string;
      fundId?: string;
      plannedReceiptsUsd: string;
      plannedExpensesUsd: string;
    };
    finance.upsertBudgetLine({ ctx: ctx(req), budgetId: id, ...body });
    return { ok: true };
  });

  app.get('/finance/bank-reconciliations/:id/matches', { preHandler: perm.ops }, async (req) => {
    const { id } = req.params as { id: string };
    return { data: finance.listReconciliationMatches({ ctx: ctx(req), bankReconciliationId: id }) };
  });

  app.post('/finance/bank-reconciliations/:id/matches', { preHandler: requirePermission('finance:operations:modifier') }, async (req) => {
    const { id } = req.params as { id: string };
    const body = req.body as {
      bankTransactionId?: string | null;
      externalStatementLineRef: string;
      matchedAmountCdf: string;
    };
    const matchId = finance.addBankReconciliationMatch({
      ctx: ctx(req),
      bankReconciliationId: id,
      ...body,
    });
    return { data: { matchId } };
  });

  app.get('/finance/budgets/:id/execution', { preHandler: perm.reports }, async (req) => {
    const { id } = req.params as { id: string };
    return { data: finance.computeBudgetExecution({ ctx: ctx(req), budgetId: id }) };
  });

  // ─── CLÔTURES ─────────────────────────────────────────────────────────
  app.post('/finance/closures', { preHandler: requirePermission('finance:operations:modifier') }, async (req) => {
    const body = req.body as {
      closureType: 'MONTH' | 'QUARTER' | 'YEAR';
      periodStart: string;
      periodEnd: string;
      notes?: string;
    };
    const id = finance.createClosure({ ctx: ctx(req), ...body });
    return { data: { closureId: id } };
  });

  // ─── DASHBOARD & RAPPORTS ─────────────────────────────────────────────
  app.get('/finance/dashboard', { preHandler: perm.reports }, async (req) => {
    return { data: finance.getFinanceDashboard(ctx(req)) };
  });

  app.get('/finance/reports/synthesis/categories', { preHandler: perm.reports }, async (req) => {
    const q = req.query as { dateFrom?: string; dateTo?: string };
    return { data: finance.synthesisByCategory(ctx(req), q) };
  });

  app.get('/finance/reports/synthesis/period', { preHandler: perm.reports }, async (req) => {
    const q = req.query as { dateFrom: string; dateTo: string };
    return { data: finance.synthesisPeriod(ctx(req), q) };
  });

  // ─── LISTES COMPLÉMENTAIRES ───────────────────────────────────────────
  app.get('/finance/pledges', { preHandler: perm.ops }, async (req) => {
    return { data: finance.listPledges(ctx(req)) };
  });

  app.get('/finance/budgets', { preHandler: perm.reports }, async (req) => {
    return { data: finance.listBudgets(ctx(req)) };
  });

  app.get('/finance/closures', { preHandler: perm.ops }, async (req) => {
    return { data: finance.listClosures(ctx(req)) };
  });

  app.get('/finance/counting-sessions', { preHandler: perm.ops }, async (req) => {
    return { data: finance.listCountingSessions(ctx(req)) };
  });

  app.get('/finance/cash-sessions', { preHandler: perm.ops }, async (req) => {
    return { data: finance.listCashSessions(ctx(req)) };
  });

  app.get('/finance/cash-boxes', { preHandler: perm.ops }, async (req) => {
    return { data: finance.listCashBoxes(ctx(req)) };
  });

  app.get('/finance/dashboard/pastoral', { preHandler: perm.reports }, async (req) => {
    return { data: finance.getPastoralDashboard(ctx(req)) };
  });

  // ─── AUDIT ────────────────────────────────────────────────────────────
  app.get('/finance/audit', { preHandler: requirePermission('finance:audit:voir') }, async (req) => {
    const q = req.query as {
      limit?: string;
      action?: string;
      entityType?: string;
      dateFrom?: string;
      dateTo?: string;
      actorUserId?: string;
    };
    return {
      data: finance.listAudit(ctx(req), {
        limit: Number(q.limit ?? 100),
        action: q.action,
        entityType: q.entityType,
        dateFrom: q.dateFrom,
        dateTo: q.dateTo,
        actorUserId: q.actorUserId,
      }),
    };
  });
}
