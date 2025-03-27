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

// Crear rate limiters en la inicialización, no durante las solicitudes
const mlRateLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minuto
  max: 10 // 10 peticiones por minuto para usuarios autenticados
});

// Todas las rutas del servicio de ML
mlService.routes.forEach(route => {
  // Todas las rutas ahora requieren autenticación
  router.all(
    route.path,
    verifyToken, // Middleware de autenticación para todas las rutas
    mlRateLimiter,
    (req, res, next) => {
      console.log(`Accediendo a ruta protegida de ML: ${route.path}`);
      next();
    },
    proxy.createServiceProxy('ml', config.services.ml)
  );
});

export default router;