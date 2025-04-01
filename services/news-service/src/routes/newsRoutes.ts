import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import newsController from '../controllers/newsController';

const router = Router();

// Rutas públicas (no requieren autenticación)
router.get('/', newsController.getNewsFeed);
router.get('/:id', newsController.getNewsById);

// Rutas protegidas (requieren autenticación)

export default router;