import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import newsController from '../controllers/newsController';

const router = Router();

// Rutas públicas (no requieren autenticación)
router.get('/', newsController.getRecentNews);
router.get('/:id', newsController.getNewsById);
router.get('/topic/:temaId', newsController.getNewsByTopic);

// Rutas protegidas (requieren autenticación)
router.get('/stats/general', authenticate, newsController.getNewsStats);

export default router;