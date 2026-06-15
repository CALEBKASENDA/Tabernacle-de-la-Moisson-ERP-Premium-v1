import type { TenantContext } from '../tenantContext';
import type { SqliteDatabase } from '../sqlite/sqliteDatabase';
import { newId } from '@tabernacle/erp-premium-domain';

export type MemberRow = {
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

export class MemberRepository {
  constructor(private readonly db: SqliteDatabase) {}

  list(ctx: TenantContext, filters?: { q?: string; status?: string }): MemberRow[] {
    let sql = `SELECT * FROM church_member WHERE church_id=@church_id AND deleted_at IS NULL`;
    const binds: Record<string, unknown> = { church_id: ctx.churchId };
    if (filters?.status) {
      sql += ` AND status=@status`;
      binds.status = filters.status;
    }
    if (filters?.q?.trim()) {
      sql += ` AND (full_name LIKE @q OR phone LIKE @q OR email LIKE @q)`;
      binds.q = `%${filters.q.trim()}%`;
    }
    sql += ` ORDER BY full_name ASC`;
    return this.db.all<MemberRow>(sql, binds);
  }

  getById(ctx: TenantContext, memberId: string): MemberRow | null {
    return (
      this.db.get<MemberRow>(
        `SELECT * FROM church_member WHERE church_id=@church_id AND member_id=@id AND deleted_at IS NULL`,
        { church_id: ctx.churchId, id: memberId }
      ) ?? null
    );
  }

  create(params: {
    ctx: TenantContext;
    fullName: string;
    phone?: string | null;
    email?: string | null;
    birthDate?: string | null;
    gender?: string | null;
    notes?: string | null;
  }): string {
    const id = newId('member');
    const now = new Date().toISOString();
    this.db.run(
      `INSERT INTO church_member (
        member_id, church_id, full_name, phone, email, birth_date, gender, status, notes,
        created_at, updated_at, created_by_user_id, updated_by_user_id
      ) VALUES (
        @id, @church_id, @name, @phone, @email, @birth, @gender, 'active', @notes,
        @now, @now, @user, @user
      )`,
      {
        id,
        church_id: params.ctx.churchId,
        name: params.fullName.trim(),
        phone: params.phone?.trim() || null,
        email: params.email?.trim().toLowerCase() || null,
        birth: params.birthDate ?? null,
        gender: params.gender ?? null,
        notes: params.notes?.trim() || null,
        now,
        user: params.ctx.userId,
      }
    );
    return id;
  }

  update(params: {
    ctx: TenantContext;
    memberId: string;
    patch: {
      fullName?: string;
      phone?: string | null;
      email?: string | null;
      birthDate?: string | null;
      gender?: string | null;
      status?: string;
      notes?: string | null;
    };
  }): void {
    const now = new Date().toISOString();
    const p = params.patch;
    this.db.run(
      `UPDATE church_member SET
        full_name=COALESCE(@name, full_name),
        phone=COALESCE(@phone, phone),
        email=COALESCE(@email, email),
        birth_date=COALESCE(@birth, birth_date),
        gender=COALESCE(@gender, gender),
        status=COALESCE(@status, status),
        notes=COALESCE(@notes, notes),
        updated_at=@now, updated_by_user_id=@user
       WHERE church_id=@church_id AND member_id=@id AND deleted_at IS NULL`,
      {
        name: p.fullName?.trim(),
        phone: p.phone,
        email: p.email?.trim().toLowerCase(),
        birth: p.birthDate,
        gender: p.gender,
        status: p.status,
        notes: p.notes,
        now,
        user: params.ctx.userId,
        church_id: params.ctx.churchId,
        id: params.memberId,
      }
    );
  }

  softDelete(ctx: TenantContext, memberId: string): void {
    const now = new Date().toISOString();
    this.db.run(
      `UPDATE church_member SET deleted_at=@now, status='archived', updated_at=@now, updated_by_user_id=@user
       WHERE church_id=@church_id AND member_id=@id`,
      { now, user: ctx.userId, church_id: ctx.churchId, id: memberId }
    );
  }

  countActive(ctx: TenantContext): number {
    const row = this.db.get<{ n: number }>(
      `SELECT COUNT(*) AS n FROM church_member WHERE church_id=@church_id AND deleted_at IS NULL AND status='active'`,
      { church_id: ctx.churchId }
    );
    return row?.n ?? 0;
  }
}
