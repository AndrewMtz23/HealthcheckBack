import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import historyController from '../controllers/historyController';

const router = Router();

// Rutas que requieren autenticación
router.use(authenticate);

// Obtener historial de usuario
router.get('/', historyController.getUserHistory);

// Eliminar entrada específica del historial
router.delete('/:id', historyController.deleteHistoryEntry);

// Eliminar todo el historial
router.delete('/', historyController.clearUserHistory);

export default router;