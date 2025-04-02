import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import temasController from '../controllers/temasController';

const router = Router();

// Ruta pública para obtener temas
router.get('/', temasController.getTemas);

// Rutas protegidas para administradores
router.post('/', 
  authenticate, 
  authorize(['admin']), 
  temasController.createTema
);

router.put('/:id', 
  authenticate, 
  authorize(['admin']), 
  temasController.updateTema
);

export default router;