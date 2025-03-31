// routes/notifications.routes.ts
import { Router } from 'express';
import { verifyToken } from '../middleware/auth';
import proxy from './proxy';
import config from '../config';
import services from '../config/services';

const router = Router();
const notificationsService = services.find(service => service.name === 'notifications');

if (!notificationsService) {
  throw new Error('Servicio de notificaciones no configurado');
}

// Todas las rutas requieren autenticación en este servicio
notificationsService.routes.forEach(route => {
  router.all(
    route.path,
    verifyToken,
    (req, res, next) => {
      console.log(`Accediendo a ruta de notificaciones: ${route.path}`);
      
      // Aplicar rate limiting si está configurado para la ruta
      if (route.rateLimit) {
        const rateLimitMiddleware = require('express-rate-limit')({
          windowMs: route.rateLimit.windowMs,
          max: route.rateLimit.max,
          message: {
            status: 'error',
            message: 'Demasiadas solicitudes, por favor intente de nuevo más tarde.'
          }
        });
        rateLimitMiddleware(req, res, next);
      } else {
        next();
      }
    },
    proxy.createServiceProxy('notifications', config.services.notifications)
  );
});

export default router;