import { QueryTypes, UniqueConstraintError } from 'sequelize';
import sequelize from '../config/db';
import { AdminError } from './query';
export function contentValues(section: string, body: any, create: boolean) {
    if (!body || typeof body !== 'object' || Array.isArray(body))
        throw new AdminError(400, 'Datos inválidos');
    const allowed = section === 'sources' ? ['nombre', 'url', 'descripcion', 'confiabilidad', 'verificada'] : ['nombre', 'descripcion', 'palabras_clave', 'activo'];
    const data: any = {};
    for (const key of allowed)
        if (body[key] !== undefined)
            data[key] = body[key];
    if (create || data.nombre !== undefined) {
        if (typeof data.nombre !== 'string' || !data.nombre.trim() || data.nombre.length > 255)
            throw new AdminError(400, 'Nombre requerido (máximo 255 caracteres)');
        data.nombre = data.nombre.trim();
    }
    for (const key of ['descripcion', 'palabras_clave'])
        if (data[key] !== undefined && (typeof data[key] !== 'string' || data[key].length > 20000))
            throw new AdminError(400, `${key}: texto inválido`);
    for (const key of ['activo', 'verificada'])
        if (data[key] !== undefined && typeof data[key] !== 'boolean')
            throw new AdminError(400, 'Estado inválido');
    if (data.confiabilidad !== undefined && (typeof data.confiabilidad !== 'number' || !Number.isFinite(data.confiabilidad) || data.confiabilidad < 0 || data.confiabilidad > 1))
        throw new AdminError(400, 'Confiabilidad entre 0 y 1');
    if (data.url !== undefined) {
        if (data.url === '')
            data.url = null;
        else {
            try {
                const url = new URL(data.url);
                if (!['http:', 'https:'].includes(url.protocol) || typeof data.url !== 'string' || data.url.length > 2048)
                    throw new Error();
            }
            catch {
                throw new AdminError(400, 'URL http/https inválida');
            }
        }
    }
    if (!Object.keys(data).length)
        throw new AdminError(400, 'No hay cambios');
    return data;
}
export async function saveContent(section: string, id: number | null, body: any, actor: number) {
    if (!['sources', 'topics'].includes(section))
        throw new AdminError(404, 'Operación no disponible');
    const data = contentValues(section, body, id === null);
    const table = section === 'sources' ? 'fuentes' : 'temas';
    const keys = Object.keys(data);
    try {
        return await sequelize.transaction(async (transaction) => {
            const users = await sequelize.query('SELECT id FROM usuarios WHERE id=:actor AND activo=true AND rol=\'admin\' FOR SHARE', { replacements: { actor }, type: QueryTypes.SELECT, transaction });
            if (!users.length)
                throw new AdminError(403, 'Permiso revocado');
            const command = id === null ? `INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map(k => `:${k}`).join(',')}) RETURNING *` : `UPDATE ${table} SET ${keys.map(k => `${k}=:${k}`).join(',')}${section === 'sources' ? ',updated_at=now()' : ''} WHERE id=:id RETURNING *`;
            const rows = await sequelize.query(command, { replacements: { ...data, id }, type: QueryTypes.SELECT, transaction });
            if (!rows.length)
                throw new AdminError(404, 'Registro no encontrado');
            return rows[0];
        });
    }
    catch (error) {
        if (error instanceof UniqueConstraintError)
            throw new AdminError(409, 'Ya existe un registro con ese nombre o URL');
        throw error;
    }
}
export async function resolveReport(id: number, estado: string, actor: number) {
    if (!['revisado', 'desestimado'].includes(estado))
        throw new AdminError(400, 'Selecciona revisado o desestimado');
    return sequelize.transaction(async (transaction) => {
        const users = await sequelize.query('SELECT id FROM usuarios WHERE id=:actor AND activo=true AND rol=\'admin\' FOR SHARE', { replacements: { actor }, type: QueryTypes.SELECT, transaction });
        if (!users.length)
            throw new AdminError(403, 'Permiso revocado');
        const rows = await sequelize.query<any>('SELECT * FROM reportes_fuente WHERE id=:id FOR UPDATE', { replacements: { id }, type: QueryTypes.SELECT, transaction });
        const report = rows[0];
        if (!report)
            throw new AdminError(404, 'Reporte no encontrado');
        if (report.estado === estado)
            return report;
        if (report.estado !== 'pendiente')
            throw new AdminError(409, 'Este reporte ya fue resuelto');
        if (estado === 'revisado')
            await sequelize.query('UPDATE fuentes SET confiabilidad=GREATEST(0,confiabilidad-0.1),updated_at=now() WHERE id=:id', { replacements: { id: report.fuente_id }, transaction });
        const updated = await sequelize.query('UPDATE reportes_fuente SET estado=:estado,fecha_revision=now() WHERE id=:id RETURNING *', { replacements: { id, estado }, type: QueryTypes.SELECT, transaction });
        return updated[0];
    });
}
