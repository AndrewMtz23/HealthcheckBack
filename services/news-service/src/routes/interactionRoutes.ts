// Actualización para interactionRoutes.ts
import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import interactionController from '../controllers/interactionController';

const router = Router();

// Rutas que requieren autenticación
router.use('/user', authenticate);
router.use('/:noticiaId/status', authenticate);
router.post('/', authenticate, interactionController.createOrUpdateInteraction);
router.get('/user', interactionController.getUserInteractions);
router.get('/:noticiaId/status', interactionController.getInteractionStatus);

// Ruta pública para conteos
router.get('/:noticiaId/counts', interactionController.getInteractionCounts);

export default router;