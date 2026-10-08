import { Router, Request, Response, NextFunction } from 'express';
import { Op, UniqueConstraintError } from 'sequelize';
import User from '../models/User';
import sequelize from '../config/db';
import { authenticate } from '../middleware/auth';
import { revokeUserSessions } from '../utils/sessions';
import { AdminError, validateUser, protectAdmin } from './validation';
const router = Router();
const attributes = ['id', 'nombre', 'email', 'telefono', 'imagen_url', 'rol', 'activo', 'fecha_registro', 'ultima_conexion'];
const run = (fn: (req: Request, res: Response) => Promise<void>) => (req: Request, res: Response, next: NextFunction) => { fn(req, res).catch(next); };
router.use(authenticate, async (req, res, next) => { try {
    const user = await User.findByPk((req.user as any)?.id);
    if (!user?.activo || user.rol !== 'admin') {
        res.status(403).json({ status: 'error', message: 'Se requiere administrador activo' });
        return;
    }
    next();
}
catch (error) {
    next(error);
} });
router.get('/', run(async (req, res) => {
    const page = Number(req.query.page || 1), limit = Number(req.query.limit || 15);
    if (!Number.isSafeInteger(page) || page < 1 || page > 100000 || !Number.isInteger(limit) || limit < 1 || limit > 100)
        throw new AdminError(400, 'Paginación inválida');
    const where: any = {};
    const q = String(req.query.q || '').trim();
    if (q)
        where[Op.or] = [{ nombre: { [Op.iLike]: `%${q}%` } }, { email: { [Op.iLike]: `%${q}%` } }];
    if (req.query.rol) {
        if (!['admin', 'usuario'].includes(String(req.query.rol)))
            throw new AdminError(400, 'Rol inválido');
        where.rol = req.query.rol;
    }
    if (req.query.activo) {
        if (!['true', 'false'].includes(String(req.query.activo)))
            throw new AdminError(400, 'Estado inválido');
        where.activo = req.query.activo === 'true';
    }
    const dates: any = {};
    for (const key of ['startDate', 'endDate'])
        if (req.query[key]) {
            const date = String(req.query[key]);
            if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date)
                throw new AdminError(400, 'Fecha inválida');
            dates[key === 'startDate' ? Op.gte : Op.lt] = sequelize.literal(`CAST(${sequelize.escape(date)} AS date)${key === 'endDate' ? " + INTERVAL '1 day'" : ''}`);
        }
    if (req.query.startDate && req.query.endDate && String(req.query.startDate) > String(req.query.endDate))
        throw new AdminError(400, 'El inicio debe preceder al final');
    if (Reflect.ownKeys(dates).length)
        where.fecha_registro = dates;
    const sort = req.query.sort === 'nombre' ? 'nombre' : 'fecha_registro';
    const { rows, count } = await User.findAndCountAll({ attributes, where, limit, offset: (page - 1) * limit, order: [[sort, sort === 'nombre' ? 'ASC' : 'DESC'], ['id', 'DESC']] });
    res.json({ status: 'success', data: { items: rows, total: count, page, limit, totalPages: Math.ceil(count / limit) } });
}));
router.post('/', run(async (req, res) => { const data = validateUser(req.body, true); const user = await User.create(data); res.status(201).json({ status: 'success', data: await User.findByPk(user.id, { attributes }) }); }));
router.patch('/:id', run(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id < 1)
        throw new AdminError(400, 'ID inválido');
    const data = validateUser(req.body);
    await sequelize.transaction(async (transaction) => {
        await sequelize.query('SELECT pg_advisory_xact_lock(714032)', { transaction });
        const actor = await User.findByPk((req.user as any).id, { transaction });
        if (!actor?.activo || actor.rol !== 'admin')
            throw new AdminError(403, 'Permiso revocado');
        const user = await User.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
        if (!user)
            throw new AdminError(404, 'Usuario no encontrado');
        protectAdmin(actor.id, user, data, await User.count({ where: { rol: 'admin', activo: true }, transaction }));
        await user.update(data, { transaction });
        if (data.activo === false || data.contrasena !== undefined) {
            transaction.afterCommit(() => { revokeUserSessions(id); });
        }
    });
    res.json({ status: 'success', data: await User.findByPk(id, { attributes }) });
}));
router.use((error: any, _req: Request, res: Response, _next: NextFunction) => { const status = error instanceof AdminError ? error.status : error instanceof UniqueConstraintError ? 409 : 500; res.status(status).json({ status: 'error', message: status === 500 ? 'No se pudo completar la operación' : status === 409 && !(error instanceof AdminError) ? 'El email ya está registrado' : error.message }); });
export default router;
