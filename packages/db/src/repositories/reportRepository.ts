import type { TenantContext } from '../tenantContext';
import type { SqliteDatabase } from '../sqlite/sqliteDatabase';
import { parseMoneyMicro, aggregateOperations } from '@tabernacle/erp-premium-domain';

export class ReportRepository {
  constructor(private readonly db: SqliteDatabase) {}

  private isFundsEnabled(churchId: string): boolean {
    const row = this.db.get<{ funds_enabled: number }>(
      `SELECT funds_enabled FROM church WHERE church_id=@id`,
      { id: churchId }
    );
    return !!row?.funds_enabled;
  }

  dashboard(ctx: TenantContext) {
    const today = new Date().toISOString().slice(0, 10);
    const monthStart = today.slice(0, 8) + '01';

    const dayRows = this.db.all<{ rc: string; ru: string; eu: string; ec: string }>(
      `SELECT receipts_usd_converted as rc, receipts_usd as ru, expenses_usd as eu, expenses_usd_converted as ec
       FROM financial_operation
       WHERE church_id=@church_id AND op_date=@today AND deleted_at IS NULL AND archived_at IS NULL`,
      { church_id: ctx.churchId, today }
    );

    const monthRows = this.db.all<{ rc: string; ru: string; eu: string; ec: string }>(
      `SELECT receipts_usd_converted as rc, receipts_usd as ru, expenses_usd as eu, expenses_usd_converted as ec
       FROM financial_operation
       WHERE church_id=@church_id AND op_date>=@start AND op_date<=@end AND deleted_at IS NULL AND archived_at IS NULL`,
      { church_id: ctx.churchId, start: monthStart, end: today }
    );

    const allRows = this.db.all<{ rc: string; ru: string; eu: string; ec: string }>(
      `SELECT receipts_usd_converted as rc, receipts_usd as ru, expenses_usd as eu, expenses_usd_converted as ec
       FROM financial_operation
       WHERE church_id=@church_id AND deleted_at IS NULL AND archived_at IS NULL`,
      { church_id: ctx.churchId }
    );

    const toSummary = (rows: { rc: string; ru: string; eu: string; ec: string }[]) =>
      aggregateOperations(
        rows.map((row) => ({
          receiptsUsdConvertedMicro: parseMoneyMicro('USD', String(row.rc)).amountMicro,
          receiptsUsdDirectMicro: parseMoneyMicro('USD', String(row.ru ?? '0')).amountMicro,
          expensesUsdMicro: parseMoneyMicro('USD', String(row.eu)).amountMicro,
          expensesUsdConvertedMicro: parseMoneyMicro('USD', String(row.ec)).amountMicro,
        }))
      );

    const recent = this.db.all(
      `SELECT operation_id, op_date, piece_number, label, receipts_cdf, receipts_usd, expenses_cdf, expenses_usd,
              receipts_usd_converted, expenses_usd_converted, beneficiary, created_at
       FROM financial_operation
       WHERE church_id=@church_id AND deleted_at IS NULL AND archived_at IS NULL
       ORDER BY created_at DESC LIMIT 10`,
      { church_id: ctx.churchId }
    );

    const totalOps = this.db.get<{ c: number }>(
      `SELECT COUNT(*) as c FROM financial_operation WHERE church_id=@church_id AND deleted_at IS NULL`,
      { church_id: ctx.churchId }
    );

    const day = toSummary(dayRows);
    const month = toSummary(monthRows);
    const global = toSummary(allRows);

    const weekStart = this.weekStart(today);
    const yearStart = today.slice(0, 4) + '-01-01';

    const weekRows = this.db.all<{ rc: string; ru: string; eu: string; ec: string }>(
      `SELECT receipts_usd_converted as rc, receipts_usd as ru, expenses_usd as eu, expenses_usd_converted as ec
       FROM financial_operation
       WHERE church_id=@church_id AND op_date>=@start AND op_date<=@end AND deleted_at IS NULL AND archived_at IS NULL`,
      { church_id: ctx.churchId, start: weekStart, end: today }
    );

    const yearRows = this.db.all<{ rc: string; ru: string; eu: string; ec: string }>(
      `SELECT receipts_usd_converted as rc, receipts_usd as ru, expenses_usd as eu, expenses_usd_converted as ec
       FROM financial_operation
       WHERE church_id=@church_id AND op_date>=@start AND op_date<=@end AND deleted_at IS NULL AND archived_at IS NULL`,
      { church_id: ctx.churchId, start: yearStart, end: today }
    );

    const week = toSummary(weekRows);
    const year = toSummary(yearRows);

    const trend = this.monthlyTrend(ctx);
    const fonds = this.isFundsEnabled(ctx.churchId) ? this.synthesisByFund({ ctx }) : [];
    const syntheseRubriques = this.synthesisByCategory({ ctx, dateFrom: monthStart, dateTo: today });
    const comparaisonMensuelle = this.periodComparison(ctx, monthStart, today, this.prevMonthRange(today));
    const comparaisonAnnuelle = this.periodComparison(
      ctx,
      yearStart,
      today,
      this.prevYearRange(today)
    );

    return {
      soldeGlobalUsd: global.soldeNetUsdMicro.toString(),
      recettesTotalesUsd: global.totalReceiptsUsdMicro.toString(),
      depensesTotalesUsd: global.totalExpensesUsdMicro.toString(),
      tendanceMensuelle: trend,
      syntheseFonds: fonds,
      syntheseRubriques,
      comparaisonMensuelle,
      comparaisonAnnuelle,
      syntheses: {
        journaliere: this.toSynthesisBlock(ctx, day, today, today),
        hebdomadaire: this.toSynthesisBlock(ctx, week, weekStart, today),
        mensuelle: this.toSynthesisBlock(ctx, month, monthStart, today),
        annuelle: this.toSynthesisBlock(ctx, year, yearStart, today),
      },
      recettesJourUsd: day.totalReceiptsUsdMicro.toString(),
      depensesJourUsd: day.totalExpensesUsdMicro.toString(),
      recettesMoisUsd: month.totalReceiptsUsdMicro.toString(),
      depensesMoisUsd: month.totalExpensesUsdMicro.toString(),
      soldeMoisUsd: month.soldeNetUsdMicro.toString(),
      nombreOperations: totalOps?.c ?? 0,
      dernieresOperations: recent,
    };
  }

  private weekStart(isoDate: string): string {
    const d = new Date(isoDate + 'T12:00:00');
    const day = d.getDay();
    const diff = day === 0 ? 6 : day - 1;
    d.setDate(d.getDate() - diff);
    return d.toISOString().slice(0, 10);
  }

  private toSynthesisBlock(
    ctx: TenantContext,
    s: ReturnType<typeof aggregateOperations>,
    dateFrom: string,
    dateTo: string
  ) {
    return {
      dateFrom,
      dateTo,
      recettesUsd: s.totalReceiptsUsdMicro.toString(),
      depensesUsd: s.totalExpensesUsdMicro.toString(),
      soldeUsd: s.soldeNetUsdMicro.toString(),
      nombreOperations: s.operationCount,
      rubriques: this.synthesisByCategory({ ctx, dateFrom, dateTo }),
    };
  }

  monthlyTrend(ctx: TenantContext) {
    const rows = this.db.all<{ month: string; r: string; e: string }>(
      `SELECT strftime('%Y-%m', op_date) as month,
        COALESCE(SUM(CAST(receipts_usd_converted AS REAL) + CAST(receipts_usd AS REAL)), 0) as r,
        COALESCE(SUM(CAST(expenses_usd AS REAL) + CAST(expenses_usd_converted AS REAL)), 0) as e
       FROM financial_operation
       WHERE church_id=@church_id AND deleted_at IS NULL AND archived_at IS NULL
       GROUP BY month ORDER BY month DESC LIMIT 6`,
      { church_id: ctx.churchId }
    );
    return rows.reverse().map((row) => ({
      mois: row.month,
      recettesUsd: parseMoneyMicro('USD', String(row.r)).amountMicro.toString(),
      depensesUsd: parseMoneyMicro('USD', String(row.e)).amountMicro.toString(),
    }));
  }

  synthesisByFund(params: { ctx: TenantContext; dateFrom?: string; dateTo?: string }) {
    let sql = `
      SELECT f.fund_id, f.name,
        COALESCE(SUM(CAST(o.receipts_usd_converted AS REAL) + CAST(o.receipts_usd AS REAL)), 0) as receipts,
        COALESCE(SUM(CAST(o.expenses_usd AS REAL) + CAST(o.expenses_usd_converted AS REAL)), 0) as expenses
      FROM finance_fund f
      LEFT JOIN financial_operation o ON o.fund_id = f.fund_id AND o.church_id = f.church_id
        AND o.deleted_at IS NULL AND o.archived_at IS NULL`;
    const binds: Record<string, unknown> = { church_id: params.ctx.churchId };
    if (params.dateFrom) {
      sql += ` AND o.op_date >= @date_from`;
      binds.date_from = params.dateFrom;
    }
    if (params.dateTo) {
      sql += ` AND o.op_date <= @date_to`;
      binds.date_to = params.dateTo;
    }
    sql += ` WHERE f.church_id=@church_id AND f.status='active' GROUP BY f.fund_id ORDER BY f.sort_order`;
    const rows = this.db.all<{ fund_id: string; name: string; receipts: string; expenses: string }>(sql, binds);
    return rows.map((r) => {
      const rec = parseMoneyMicro('USD', String(r.receipts)).amountMicro;
      const exp = parseMoneyMicro('USD', String(r.expenses)).amountMicro;
      return {
        fundId: r.fund_id,
        name: r.name,
        recettesUsd: rec.toString(),
        depensesUsd: exp.toString(),
        soldeUsd: (rec - exp).toString(),
      };
    });
  }

  pastoralDashboard(ctx: TenantContext) {
    const dash = this.dashboard(ctx);
    return {
      soldeGlobalUsd: dash.soldeGlobalUsd,
      recettesTotalesUsd: dash.recettesTotalesUsd,
      depensesTotalesUsd: dash.depensesTotalesUsd,
      recettesMoisUsd: dash.recettesMoisUsd,
      depensesMoisUsd: dash.depensesMoisUsd,
      soldeMoisUsd: dash.soldeMoisUsd,
      nombreOperations: dash.nombreOperations,
      syntheseFonds: dash.syntheseFonds,
      syntheseRubriques: dash.syntheses?.mensuelle.rubriques ?? [],
      tendanceMensuelle: dash.tendanceMensuelle,
      syntheses: dash.syntheses,
    };
  }

  synthesisByCategory(params: { ctx: TenantContext; dateFrom?: string; dateTo?: string }) {
    let sql = `
      SELECT c.category_id, c.name,
        COALESCE(SUM(CAST(o.receipts_usd_converted AS REAL) + CAST(o.receipts_usd AS REAL)), 0) as receipts,
        COALESCE(SUM(CAST(o.expenses_usd AS REAL) + CAST(o.expenses_usd_converted AS REAL)), 0) as expenses
      FROM finance_category c
      LEFT JOIN financial_operation o ON o.category_id = c.category_id AND o.church_id = c.church_id
        AND o.deleted_at IS NULL AND o.archived_at IS NULL`;
    const binds: Record<string, unknown> = { church_id: params.ctx.churchId };
    if (params.dateFrom) {
      sql += ` AND o.op_date >= @date_from`;
      binds.date_from = params.dateFrom;
    }
    if (params.dateTo) {
      sql += ` AND o.op_date <= @date_to`;
      binds.date_to = params.dateTo;
    }
    sql += ` WHERE c.church_id=@church_id AND c.status='active' GROUP BY c.category_id ORDER BY c.sort_order`;
    const rows = this.db.all<{ category_id: string; name: string; receipts: string; expenses: string }>(
      sql,
      binds
    );
    return rows.map((r) => {
      const rec = parseMoneyMicro('USD', String(r.receipts)).amountMicro;
      const exp = parseMoneyMicro('USD', String(r.expenses)).amountMicro;
      return {
        categoryId: r.category_id,
        name: r.name,
        recettesUsd: rec.toString(),
        depensesUsd: exp.toString(),
        soldeUsd: (rec - exp).toString(),
      };
    });
  }

  synthesisPeriod(params: { ctx: TenantContext; dateFrom: string; dateTo: string }) {
    const rows = this.db.all<{ rc: string; ru: string; eu: string; ec: string }>(
      `SELECT receipts_usd_converted as rc, receipts_usd as ru, expenses_usd as eu, expenses_usd_converted as ec
       FROM financial_operation
       WHERE church_id=@church_id AND op_date>=@from AND op_date<=@to AND deleted_at IS NULL AND archived_at IS NULL`,
      { church_id: params.ctx.churchId, from: params.dateFrom, to: params.dateTo }
    );
    const s = aggregateOperations(
      rows.map((row) => ({
        receiptsUsdConvertedMicro: parseMoneyMicro('USD', String(row.rc)).amountMicro,
        receiptsUsdDirectMicro: parseMoneyMicro('USD', String(row.ru ?? '0')).amountMicro,
        expensesUsdMicro: parseMoneyMicro('USD', String(row.eu)).amountMicro,
        expensesUsdConvertedMicro: parseMoneyMicro('USD', String(row.ec)).amountMicro,
      }))
    );
    return {
      dateFrom: params.dateFrom,
      dateTo: params.dateTo,
      recettesUsd: s.totalReceiptsUsdMicro.toString(),
      depensesUsd: s.totalExpensesUsdMicro.toString(),
      soldeUsd: s.soldeNetUsdMicro.toString(),
      nombreOperations: s.operationCount,
      recettesPeriodeUsd: s.totalReceiptsUsdMicro.toString(),
      depensesPeriodeUsd: s.totalExpensesUsdMicro.toString(),
      soldePeriodeUsd: s.soldeNetUsdMicro.toString(),
      rubriques: this.synthesisByCategory({
        ctx: params.ctx,
        dateFrom: params.dateFrom,
        dateTo: params.dateTo,
      }),
    };
  }

  private prevMonthRange(today: string): { from: string; to: string; label: string } {
    const d = new Date(today + 'T12:00:00');
    d.setDate(1);
    d.setDate(0);
    const to = d.toISOString().slice(0, 10);
    d.setDate(1);
    const from = d.toISOString().slice(0, 10);
    return { from, to, label: 'Mois précédent' };
  }

  private prevYearRange(today: string): { from: string; to: string; label: string } {
    const y = Number(today.slice(0, 4)) - 1;
    return { from: `${y}-01-01`, to: `${y}-12-31`, label: String(y) };
  }

  private summaryForRange(ctx: TenantContext, from: string, to: string) {
    const rows = this.db.all<{ rc: string; ru: string; eu: string; ec: string }>(
      `SELECT receipts_usd_converted as rc, receipts_usd as ru, expenses_usd as eu, expenses_usd_converted as ec
       FROM financial_operation
       WHERE church_id=@church_id AND op_date>=@from AND op_date<=@to AND deleted_at IS NULL AND archived_at IS NULL`,
      { church_id: ctx.churchId, from, to }
    );
    return aggregateOperations(
      rows.map((row) => ({
        receiptsUsdConvertedMicro: parseMoneyMicro('USD', String(row.rc)).amountMicro,
        receiptsUsdDirectMicro: parseMoneyMicro('USD', String(row.ru ?? '0')).amountMicro,
        expensesUsdMicro: parseMoneyMicro('USD', String(row.eu)).amountMicro,
        expensesUsdConvertedMicro: parseMoneyMicro('USD', String(row.ec)).amountMicro,
      }))
    );
  }

  private periodComparison(
    ctx: TenantContext,
    currentFrom: string,
    currentTo: string,
    previous: { from: string; to: string; label: string }
  ) {
    const cur = this.summaryForRange(ctx, currentFrom, currentTo);
    const prev = this.summaryForRange(ctx, previous.from, previous.to);
    return {
      periodeCourante: {
        label: 'Période courante',
        dateFrom: currentFrom,
        dateTo: currentTo,
        recettesUsd: cur.totalReceiptsUsdMicro.toString(),
        depensesUsd: cur.totalExpensesUsdMicro.toString(),
        soldeUsd: cur.soldeNetUsdMicro.toString(),
      },
      periodePrecedente: {
        label: previous.label,
        dateFrom: previous.from,
        dateTo: previous.to,
        recettesUsd: prev.totalReceiptsUsdMicro.toString(),
        depensesUsd: prev.totalExpensesUsdMicro.toString(),
        soldeUsd: prev.soldeNetUsdMicro.toString(),
      },
    };
  }
}
