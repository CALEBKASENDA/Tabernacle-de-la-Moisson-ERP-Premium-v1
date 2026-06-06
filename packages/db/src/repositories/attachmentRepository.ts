import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type { TenantContext } from '../tenantContext';
import type { SqliteDatabase } from '../sqlite/sqliteDatabase';
import { newId } from '@tabernacle/erp-premium-domain';

export type AttachmentRow = {
  attachment_id: string;
  church_id: string;
  operation_id: string;
  attachment_kind: string;
  file_name: string;
  mime_type: string | null;
  size_bytes: number | null;
  sha256: string | null;
  encrypted_blob_ref: string;
  created_at: string;
  created_by_user_id: string;
};

export class AttachmentRepository {
  constructor(
    private readonly db: SqliteDatabase,
    private readonly dataDir: string
  ) {}

  private attachmentsRoot(churchId: string): string {
    return path.join(this.dataDir, 'attachments', churchId);
  }

  listByOperation(ctx: TenantContext, operationId: string): AttachmentRow[] {
    return this.db.all<AttachmentRow>(
      `SELECT * FROM operation_attachment
       WHERE church_id=@church_id AND operation_id=@operation_id
       ORDER BY created_at DESC`,
      { church_id: ctx.churchId, operation_id: operationId }
    );
  }

  add(params: {
    ctx: TenantContext;
    operationId: string;
    fileName: string;
    mimeType?: string;
    contentBase64: string;
    kind?: string;
  }): string {
    const op = this.db.get<{ operation_id: string }>(
      `SELECT operation_id FROM financial_operation
       WHERE operation_id=@id AND church_id=@church_id AND deleted_at IS NULL`,
      { id: params.operationId, church_id: params.ctx.churchId }
    );
    if (!op) throw new Error('Opération introuvable');

    const buffer = Buffer.from(params.contentBase64, 'base64');
    if (buffer.length === 0) throw new Error('Fichier vide');
    if (buffer.length > 15 * 1024 * 1024) throw new Error('Fichier trop volumineux (max 15 Mo)');

    const attachmentId = newId('attach');
    const dir = path.join(this.attachmentsRoot(params.ctx.churchId), params.operationId);
    fs.mkdirSync(dir, { recursive: true });
    const safeName = params.fileName.replace(/[^\w.\-() ]+/g, '_').slice(0, 120);
    const relRef = path.join('attachments', params.ctx.churchId, params.operationId, `${attachmentId}_${safeName}`);
    const absRef = path.join(this.dataDir, relRef);
    fs.writeFileSync(absRef, buffer);

    const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
    const now = new Date().toISOString();

    this.db.run(
      `INSERT INTO operation_attachment (
        attachment_id, church_id, operation_id, attachment_kind, file_name, mime_type,
        size_bytes, sha256, encrypted_blob_ref, created_at, created_by_user_id
      ) VALUES (
        @id, @church_id, @operation_id, @kind, @file_name, @mime_type,
        @size, @sha256, @ref, @now, @user_id
      )`,
      {
        id: attachmentId,
        church_id: params.ctx.churchId,
        operation_id: params.operationId,
        kind: params.kind ?? 'JUSTIFICATIF',
        file_name: safeName,
        mime_type: params.mimeType ?? null,
        size: buffer.length,
        sha256,
        ref: relRef.replace(/\\/g, '/'),
        now,
        user_id: params.ctx.userId,
      }
    );

    return attachmentId;
  }

  getFilePath(ctx: TenantContext, attachmentId: string): { absPath: string; row: AttachmentRow } | null {
    const row = this.db.get<AttachmentRow>(
      `SELECT * FROM operation_attachment WHERE attachment_id=@id AND church_id=@church_id`,
      { id: attachmentId, church_id: ctx.churchId }
    );
    if (!row) return null;
    const absPath = path.join(this.dataDir, row.encrypted_blob_ref.replace(/\//g, path.sep));
    if (!fs.existsSync(absPath)) return null;
    return { absPath, row };
  }

  remove(ctx: TenantContext, attachmentId: string): void {
    const found = this.getFilePath(ctx, attachmentId);
    if (!found) throw new Error('Pièce jointe introuvable');
    try {
      fs.unlinkSync(found.absPath);
    } catch {
      /* fichier déjà absent */
    }
    this.db.run(
      `DELETE FROM operation_attachment WHERE attachment_id=@id AND church_id=@church_id`,
      { id: attachmentId, church_id: ctx.churchId }
    );
  }
}
