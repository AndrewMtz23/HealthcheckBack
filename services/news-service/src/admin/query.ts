export class AdminError extends Error {
    constructor(public status: number, message: string) { super(message); }
}
export function parseQuery(query: any) {
    const page = Number(query.page || 1), limit = Number(query.limit || 15);
    if (!Number.isSafeInteger(page) || page < 1 || page > 100000 || !Number.isInteger(limit) || limit < 1 || limit > 100)
        throw new AdminError(400, 'Paginación inválida');
    const startDate = query.startDate ? String(query.startDate) : null, endDate = query.endDate ? String(query.endDate) : null;
    for (const date of [startDate, endDate])
        if (date && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date))
            throw new AdminError(400, 'Fecha inválida');
    if (startDate && endDate && startDate > endDate)
        throw new AdminError(400, 'El inicio debe preceder al final');
    return { page, limit, offset: (page - 1) * limit, q: `%${String(query.q || '').trim().slice(0, 255)}%`, startDate, endDate };
}
export function positiveId(value: any) { const id = Number(value); if (!Number.isSafeInteger(id) || id < 1)
    throw new AdminError(400, 'ID inválido'); return id; }
