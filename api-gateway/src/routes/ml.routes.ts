import { Router } from 'express';
import { verifyToken } from '../middleware/auth';
import { createRateLimiter } from '../middleware/rateLimit';
import proxy from './proxy';
import config from '../config';
import services from '../config/services';

const router = Router();
const mlService = services.find(service => service.name === 'ml');

if (!mlService) {
  throw new Error('Servicio de ML no configurado');
}

// Todas las rutas del servicio de ML requieren autenticación
mlService.routes.forEach(route => {
  // Corregido: la ruta debe ser solo el path final, no incluir /api/ml
  router.all(
    route.path,
    (req, res, next) => {
      console.log(`Accediendo a ruta de ML: ${route.path}`);
      
      // Aplicar rate limiting específico si está configurado
      if (route.rateLimit) {
        const limiter = createRateLimiter({
          windowMs: route.rateLimit.windowMs,
          max: route.rateLimit.max
        });
        return limiter(req, res, next);
      }
      next();
    },
    verifyToken,
    proxy.createServiceProxy('ml', config.services.ml)
  );
});

export default router;