import type { SqliteDatabase } from '../sqlite/sqliteDatabase';
import { newId } from '@tabernacle/erp-premium-domain';
import { seedChurchDefaults, seedChurchFunds } from '../schema/initFinanceSchema';

export type ChurchRow = {
  church_id: string;
  name: string;
  status: string;
  funds_enabled: number;
  created_at: string;
  updated_at: string;
};

export class ChurchRepository {
  constructor(private readonly db: SqliteDatabase) {}

  list(): ChurchRow[] {
    return this.db.all<ChurchRow>(
      `SELECT church_id, name, status, funds_enabled, created_at, updated_at FROM church ORDER BY name`
    );
  }

  getById(churchId: string): ChurchRow | null {
    return this.db.get<ChurchRow>(
      `SELECT church_id, name, status, funds_enabled, created_at, updated_at FROM church WHERE church_id=@id`,
      { id: churchId }
    ) ?? null;
  }

  isFundsEnabled(churchId: string): boolean {
    const row = this.db.get<{ funds_enabled: number }>(
      `SELECT funds_enabled FROM church WHERE church_id=@id`,
      { id: churchId }
    );
    return !!row?.funds_enabled;
  }

  create(params: { name: string }): string {
    const now = new Date().toISOString();
    const id = newId('church');
    this.db.run(
      `INSERT INTO church (church_id, name, status, funds_enabled, created_at, updated_at)
       VALUES (@id, @name, 'active', 0, @now, @now)`,
      { id, name: params.name, now }
    );
    seedChurchDefaults(this.db, id, params.name);
    return id;
  }

  update(params: { churchId: string; name?: string; status?: string; fundsEnabled?: boolean }): void {
    const row = this.getById(params.churchId);
    if (!row) throw new Error('Église introuvable');
    const now = new Date().toISOString();
    const fundsEnabled =
      params.fundsEnabled !== undefined ? (params.fundsEnabled ? 1 : 0) : row.funds_enabled;
    this.db.run(
      `UPDATE church SET name=@name, status=@status, funds_enabled=@funds_enabled, updated_at=@now WHERE church_id=@id`,
      {
        name: params.name ?? row.name,
        status: params.status ?? row.status,
        funds_enabled: fundsEnabled,
        now,
        id: params.churchId,
      }
    );
    if (params.fundsEnabled && !row.funds_enabled) {
      seedChurchFunds(this.db, params.churchId);
    }
  }

  softDelete(churchId: string): void {
    this.update({ churchId, status: 'disabled' });
  }
}
