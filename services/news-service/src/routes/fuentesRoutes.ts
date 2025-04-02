import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import fuentesController from '../controllers/fuentesController';

const router = Router();

// Ruta pública para obtener fuentes
router.get('/', fuentesController.getFuentes);

// Rutas protegidas para administradores
router.post('/', 
  authenticate, 
  authorize(['admin']), 
  fuentesController.createFuente
);

router.put('/:id', 
  authenticate, 
  authorize(['admin']), 
  fuentesController.updateFuente
);

export default router;