import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import searchController from '../controllers/searchController';

const router = Router();

// Ruta de búsqueda simple (pública)
router.get('/', searchController.searchNews);

// Ruta de búsqueda avanzada (requiere autenticación)
router.post('/advanced', authenticate, searchController.advancedSearch);

export default router;