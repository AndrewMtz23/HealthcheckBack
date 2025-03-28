import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import reportController from '../controllers/reportController';

const router = Router();

// Todas las rutas requieren autenticación
router.use(authenticate);

// Crear reporte (cualquier usuario autenticado)
router.post('/', reportController.createReport);

// Rutas solo para administradores
router.get('/', authorize(['admin']), reportController.getReports);
router.put('/:id', authorize(['admin']), reportController.updateReportStatus);

export default router;