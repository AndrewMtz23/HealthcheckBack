import { Router } from 'express';
import authRoutes from './auth.routes';
import mlRoutes from './ml.routes';
import notificationsRoutes from './notifications.routes';
import { successResponse } from '../utils/responseFormatter';

// Crear un nuevo router de Express
const apiRouter = Router();

// Ruta principal de API para verificar estado
apiRouter.get('/health', (req, res) => {
  successResponse(res, {
    message: 'API Gateway funcionando correctamente',
    data: {
      timestamp: new Date(),
      uptime: process.uptime(),
    },
  });
});

// Prefijamos las rutas de servicios
apiRouter.use('/api/auth', authRoutes);
apiRouter.use('/api/ml', mlRoutes);
apiRouter.use('/api/notifications', notificationsRoutes);

// Exportar el router como default
export default apiRouter;