import { QueryTypes } from 'sequelize';
import sequelize from '../config/db';
import { AdminError, parseQuery, positiveId } from './query';
export const sql = (query: string, replacements: any = {}) => sequelize.query<any>(query, { replacements, type: QueryTypes.SELECT });
const latest = `LEFT JOIN LATERAL (SELECT resultado,confianza,fecha_clasificacion FROM clasificacion_noticias WHERE noticia_id=n.id ORDER BY fecha_clasificacion DESC NULLS LAST,id DESC LIMIT 1) c ON true`;
const news = `SELECT n.id,n.titulo,n.url,n.fecha_publicacion,n.created_at,n.tema_id,n.fuente_id,f.nombre AS fuente,t.nombre AS tema,COALESCE(c.resultado::text,'sin_clasificar') AS resultado,c.confianza FROM noticias n LEFT JOIN fuentes f ON f.id=n.fuente_id LEFT JOIN temas t ON t.id=n.tema_id ${latest}`;
const activity = `SELECT 'consulta-'||h.id AS id,'consulta'::text AS tipo,h.usuario_id,h.noticia_id,h.fecha_consulta AS fecha,n.titulo FROM historial_consultas h LEFT JOIN noticias n ON n.id=h.noticia_id UNION ALL SELECT 'interaccion-'||i.id,i.tipo_interaccion::text,i.usuario_id,i.noticia_id,i.fecha_interaccion,n.titulo FROM interacciones_noticia i LEFT JOIN noticias n ON n.id=i.noticia_id`;
const definitions: Record<string, {
    base: string;
    search: string;
    date?: string;
    filters?: Record<string, string>;
    order: string;
}> = {
    news: { base: news, search: 'titulo', date: 'fecha_publicacion', filters: { resultado: 'resultado', tema_id: 'tema_id' }, order: 'created_at DESC NULLS LAST,id DESC' },
    sources: { base: 'SELECT f.*,(SELECT count(*)::int FROM reportes_fuente r WHERE r.fuente_id=f.id) AS reportes FROM fuentes f', search: 'nombre', date: 'created_at', filters: { verificada: 'verificada' }, order: 'nombre ASC,id DESC' },
    topics: { base: 'SELECT id,nombre,descripcion,palabras_clave,activo FROM temas', search: 'nombre', filters: { activo: 'activo' }, order: 'nombre ASC,id DESC' },
    reports: { base: 'SELECT r.*,f.nombre AS fuente FROM reportes_fuente r LEFT JOIN fuentes f ON f.id=r.fuente_id', search: 'motivo', date: 'fecha_reporte', filters: { estado: 'estado' }, order: 'fecha_reporte DESC NULLS LAST,id DESC' },
    activity: { base: activity, search: 'titulo', date: 'fecha', filters: { tipo: 'tipo' }, order: 'fecha DESC NULLS LAST,id DESC' },
    models: { base: 'SELECT id,nombre,version,descripcion,precision,recall,f1_score,fecha_entrenamiento,activo,modelo_base,created_at FROM modelos_ml', search: 'nombre', date: 'fecha_entrenamiento', filters: { activo: 'activo' }, order: 'fecha_entrenamiento DESC NULLS LAST,id DESC' },
    notifications: { base: 'SELECT id,usuario_id,noticia_id,titulo,mensaje,tipo,enviada,fecha_creacion,fecha_envio FROM notificaciones', search: 'titulo', date: 'fecha_creacion', filters: { enviada: 'enviada', tipo: 'tipo' }, order: 'fecha_creacion DESC NULLS LAST,id DESC' },
    preferences: { base: `SELECT p.id,p.usuario_id,p.recibir_notificaciones,p.frecuencia_notificaciones,p.tipo_notificacion,p.created_at,COALESCE((SELECT string_agg(t.nombre,', ' ORDER BY t.nombre) FROM preferencias_usuario_temas pt JOIN temas t ON t.id=pt.tema_id WHERE pt.usuario_id=p.usuario_id),'') AS temas FROM preferencias_usuario p`, search: 'temas', date: 'created_at', order: 'id DESC' }
};
export async function list(section: string, query: any) {
    const def = definitions[section];
    if (!def)
        throw new AdminError(404, 'Módulo no encontrado');
    const p = parseQuery(query);
    const values: any = { ...p };
    const conditions = [`COALESCE(${def.search},'') ILIKE :q`];
    for (const [key, column] of Object.entries(def.filters || {}))
        if (query[key] !== undefined && query[key] !== '') {
            values[key] = String(query[key]);
            if (['activo', 'verificada', 'enviada'].includes(key) && !['true', 'false'].includes(values[key]))
                throw new AdminError(400, 'Estado inválido');
            if (key === 'tema_id')
                values[key] = positiveId(query[key]);
            conditions.push(`${column}::text = :${key}`);
            values[key] = String(values[key]);
        }
    if (def.date) {
        if (p.startDate)
            conditions.push(`${def.date} >= CAST(:startDate AS date)`);
        if (p.endDate)
            conditions.push(`${def.date} < CAST(:endDate AS date)+INTERVAL '1 day'`);
    }
    const where = conditions.join(' AND ');
    const base = `FROM (${def.base}) records WHERE ${where}`;
    const order = query.sort === 'nombre' && ['sources', 'topics', 'models'].includes(section) ? 'nombre ASC,id DESC' : def.order;
    const [items, counts] = await Promise.all([sql(`SELECT * ${base} ORDER BY ${order} LIMIT :limit OFFSET :offset`, values), sql(`SELECT count(*)::int AS total ${base}`, values)]);
    const total = counts[0].total;
    return { items, total, page: p.page, limit: p.limit, totalPages: Math.ceil(total / p.limit) };
}
export async function detail(id: number) {
    const rows = await sql(`SELECT n.*,f.nombre AS fuente,t.nombre AS tema FROM noticias n LEFT JOIN fuentes f ON f.id=n.fuente_id LEFT JOIN temas t ON t.id=n.tema_id WHERE n.id=:id`, { id });
    if (!rows.length)
        throw new AdminError(404, 'Noticia no encontrada');
    const [classifications, keywords] = await Promise.all([sql('SELECT c.id,c.resultado,c.confianza,c.explicacion,c.fecha_clasificacion,m.nombre AS modelo FROM clasificacion_noticias c LEFT JOIN modelos_ml m ON m.id=c.modelo_id WHERE c.noticia_id=:id ORDER BY c.fecha_clasificacion DESC NULLS LAST,c.id DESC', { id }), sql('SELECT k.palabra,k.relevancia FROM keywords k JOIN noticias_keywords nk ON nk.keyword_id=k.id WHERE nk.noticia_id=:id', { id })]);
    return { ...rows[0], classifications, keywords };
}
export async function summary(query: any) {
    const p = parseQuery(query);
    const days = Number(query.days || 30);
    if (![7, 30, 90].includes(days))
        throw new AdminError(400, 'Periodo inválido');
    const dates = await sql(`SELECT COALESCE(CAST(:endDate AS date),(CURRENT_TIMESTAMP AT TIME ZONE 'America/Mexico_City')::date)::text AS end,COALESCE(CAST(:startDate AS date),COALESCE(CAST(:endDate AS date),(CURRENT_TIMESTAMP AT TIME ZONE 'America/Mexico_City')::date)-(:days - 1))::text AS start`, { ...p, days });
    const range = { start: dates[0].start, end: dates[0].end };
    const [totals, distribution, trend, recent, events] = await Promise.all([
        sql(`SELECT (SELECT count(*)::int FROM usuarios WHERE activo=true) AS users,(SELECT count(*)::int FROM noticias) AS news,(SELECT count(*)::int FROM noticias n WHERE NOT EXISTS(SELECT 1 FROM clasificacion_noticias c WHERE c.noticia_id=n.id)) AS unclassified,(SELECT count(*)::int FROM reportes_fuente WHERE estado='pendiente') AS reports,(SELECT count(*)::int FROM modelos_ml WHERE activo=true) AS models,(SELECT count(*)::int FROM notificaciones WHERE enviada=false) AS notifications`),
        sql(`SELECT COALESCE(c.resultado::text,'sin_clasificar') AS resultado,count(*)::int AS total FROM noticias n ${latest} GROUP BY 1`),
        sql(`SELECT fecha_publicacion::date::text AS fecha,count(*)::int AS total FROM noticias WHERE fecha_publicacion>=CAST(:start AS date) AND fecha_publicacion<CAST(:end AS date)+INTERVAL '1 day' GROUP BY 1 ORDER BY 1`, range),
        sql(`${news} ORDER BY n.created_at DESC NULLS LAST,n.id DESC LIMIT 5`),
        sql(`SELECT * FROM (${activity}) a WHERE fecha>=CAST(:start AS date) AND fecha<CAST(:end AS date)+INTERVAL '1 day' ORDER BY fecha DESC LIMIT 5`, range)
    ]);
    return { totals: totals[0], distribution, trend, recent, activity: events, range };
}
