import { Router } from 'express';
import newsRoutes from './newsRoutes';
import interactionRoutes from './interactionRoutes';
import searchRoutes from './searchRoutes';
import reportRoutes from './reportRoutes';
import statsRoutes from './statsRoutes';

const router = Router();

router.use('/news', newsRoutes);
router.use('/interactions', interactionRoutes);
router.use('/search', searchRoutes);
router.use('/reports', reportRoutes);
router.use('/stats', statsRoutes);

// Ruta de estado del API
router.get('/health', (req, res) => {
  res.status(200).json({
    status: 'success',
    message: 'News service is up and running',
    timestamp: new Date().toISOString(),
  });
});

export default router;