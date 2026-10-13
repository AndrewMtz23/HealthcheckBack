export type AnnouncementKind = 'informativo' | 'advertencia' | 'mantenimiento';
export type AnnouncementDraftInput = {
  title: string;
  body: string;
  kind: AnnouncementKind;
  publish_at: string | null;
  expires_at: string | null;
  maintenance_start_at: string | null;
  maintenance_end_at: string | null;
};

export class AnnouncementError extends Error {
  constructor(public status: number, message: string) { super(message); this.name = 'AnnouncementError'; }
}

function dateOrNull(value: unknown, field: string): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) || !Number.isFinite(Date.parse(value)))
    throw new AnnouncementError(400, `${field} debe ser fecha ISO con zona horaria`);
  return new Date(value).toISOString();
}

export function validateAnnouncementDraft(value: unknown, now = new Date()): AnnouncementDraftInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new AnnouncementError(400, 'Aviso inválido');
  const input = value as Record<string, unknown>;
  if (typeof input.title !== 'string' || input.title.trim().length < 1 || input.title.trim().length > 180 || /[\u0000-\u001f\u007f]/.test(input.title)) throw new AnnouncementError(400, 'El título debe tener entre 1 y 180 caracteres y no incluir controles');
  if (typeof input.body !== 'string' || input.body.trim().length < 1 || input.body.trim().length > 10000 || input.body.includes('\u0000')) throw new AnnouncementError(400, 'El cuerpo debe tener entre 1 y 10000 caracteres');
  if (!['informativo', 'advertencia', 'mantenimiento'].includes(String(input.kind))) throw new AnnouncementError(400, 'Tipo de aviso inválido');
  const publish_at = dateOrNull(input.publish_at, 'publish_at');
  const expires_at = dateOrNull(input.expires_at, 'expires_at');
  const maintenance_start_at = dateOrNull(input.maintenance_start_at, 'maintenance_start_at');
  const maintenance_end_at = dateOrNull(input.maintenance_end_at, 'maintenance_end_at');
  if (expires_at && Date.parse(expires_at) <= Date.parse(now.toISOString())) throw new AnnouncementError(400, 'El vencimiento debe estar en el futuro');
  if (publish_at && expires_at && Date.parse(expires_at) <= Date.parse(publish_at)) throw new AnnouncementError(400, 'El vencimiento debe ser posterior a la publicación');
  if ((maintenance_start_at || maintenance_end_at) && input.kind !== 'mantenimiento') throw new AnnouncementError(400, 'Solo los avisos de mantenimiento aceptan fechas de afectación');
  if (Boolean(maintenance_start_at) !== Boolean(maintenance_end_at) || (maintenance_start_at && maintenance_end_at && Date.parse(maintenance_end_at) <= Date.parse(maintenance_start_at))) throw new AnnouncementError(400, 'El periodo de mantenimiento es inválido');
  return { title: input.title.trim(), body: input.body.trim(), kind: input.kind as AnnouncementKind, publish_at, expires_at, maintenance_start_at, maintenance_end_at };
}
