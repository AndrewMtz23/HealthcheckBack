import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import interactionController from '../controllers/interactionController';

const router = Router();

// Todas las rutas de interacción requieren autenticación
router.use(authenticate);

router.post('/', interactionController.createOrUpdateInteraction);
router.get('/user', interactionController.getUserInteractions);
router.get('/:noticiaId/status', interactionController.getInteractionStatus);

export default router;