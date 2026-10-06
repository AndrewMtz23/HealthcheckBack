import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth';
import { AdminError, positiveId } from './query';
import { sql, list, detail, summary } from './read';
import { saveContent, resolveReport } from './write';
const router = Router();
export const run = (fn: (req: Request, res: Response) => Promise<void>) => (req: Request, res: Response, next: NextFunction) => { fn(req, res).catch(next); };
router.use(authenticate, async (req, res, next) => { try {
    const users = await sql('SELECT id FROM usuarios WHERE id=:id AND activo=true AND rol=\'admin\'', { id: req.user?.id || 0 });
    if (!users.length) {
        res.status(403).json({ status: 'error', message: 'Se requiere administrador activo' });
        return;
    }
    next();
}
catch (error) {
    next(error);
} });
router.get('/summary', run(async (req, res) => { res.json({ status: 'success', data: await summary(req.query) }); }));
router.get('/news/:id', run(async (req, res) => { res.json({ status: 'success', data: await detail(positiveId(req.params.id)) }); }));
router.get('/:section', run(async (req, res) => { res.json({ status: 'success', data: await list(req.params.section, req.query) }); }));
router.post('/:section', run(async (req, res) => { res.status(201).json({ status: 'success', data: await saveContent(req.params.section, null, req.body, req.user!.id) }); }));
router.patch('/reports/:id', run(async (req, res) => { res.json({ status: 'success', data: await resolveReport(positiveId(req.params.id), req.body.estado, req.user!.id) }); }));
router.patch('/:section/:id', run(async (req, res) => { res.json({ status: 'success', data: await saveContent(req.params.section, positiveId(req.params.id), req.body, req.user!.id) }); }));
router.use((error: any, _req: Request, res: Response, _next: NextFunction) => { const status = error instanceof AdminError ? error.status : 500; res.status(status).json({ status: 'error', message: status === 500 ? 'No se pudo consultar el módulo' : error.message }); });
export default router;
