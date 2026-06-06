import type { TenantContext } from '../tenantContext';
import type { SqliteDatabase } from '../sqlite/sqliteDatabase';

type PiecePrefix = 'REC' | 'DEP' | 'CAI' | 'BAN';

export class NumberingSequenceRepository {
  constructor(private readonly db: SqliteDatabase) {}

  async getNext(params: {
    ctx: TenantContext;
    prefix: PiecePrefix;
    year: number;
  }): Promise<number> {
    const { ctx, prefix, year } = params;
    const sequenceKey = `${prefix}-${year}`;

    return this.db.withTransaction((tx) => {
      const row = tx.prepare(
        `SELECT last_value FROM numbering_sequence WHERE church_id=@church_id AND sequence_key=@sequence_key`
      ).get({ church_id: ctx.churchId, sequence_key: sequenceKey }) as { last_value: number } | undefined;

      const now = new Date().toISOString();
      if (!row) {
        // Initialize sequence.
        tx.prepare(
          `INSERT INTO numbering_sequence (church_id, sequence_key, prefix, year, last_value, updated_at, updated_by_user_id)
           VALUES (@church_id, @sequence_key, @prefix, @year, 1, @updated_at, @updated_by_user_id)`
        ).run({
          church_id: ctx.churchId,
          sequence_key: sequenceKey,
          prefix,
          year,
          updated_at: now,
          updated_by_user_id: ctx.userId,
        });
        return 1;
      }

      const next = row.last_value + 1;
      tx.prepare(
        `UPDATE numbering_sequence
           SET last_value=@last_value, updated_at=@updated_at, updated_by_user_id=@updated_by_user_id
         WHERE church_id=@church_id AND sequence_key=@sequence_key`
      ).run({
        last_value: next,
        updated_at: now,
        updated_by_user_id: ctx.userId,
        church_id: ctx.churchId,
        sequence_key: sequenceKey,
      });
      return next;
    });
  }
}

