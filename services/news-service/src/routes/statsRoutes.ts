import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import statsController from '../controllers/statsController';

const router = Router();

// Todas las rutas requieren autenticación
router.use(authenticate);

// Estadísticas personales (cualquier usuario autenticado)
router.get('/user', statsController.getUserStats);

// Estadísticas generales (solo para admins)
router.get('/general', authorize(['admin']), statsController.getGeneralStats);

export default router;