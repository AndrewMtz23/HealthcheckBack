import { Router } from 'express';
import newsRoutes from './newsRoutes';
import interactionRoutes from './interactionRoutes';
import searchRoutes from './searchRoutes';
import reportRoutes from './reportRoutes';
import statsRoutes from './statsRoutes';
import temasRoutes from './temasRoutes';
import fuentesRoutes from './fuentesRoutes';

const router = Router();

router.use('/news', newsRoutes);
router.use('/interactions', interactionRoutes);
router.use('/search', searchRoutes);
router.use('/reports', reportRoutes);
router.use('/stats', statsRoutes);
router.use('/temas', temasRoutes);
router.use('/fuentes', fuentesRoutes);

// Ruta de estado del API
router.get('/health', (req, res) => {
  res.status(200).json({
    status: 'success',
    message: 'News service is up and running',
    timestamp: new Date().toISOString(),
  });
});

export default router;