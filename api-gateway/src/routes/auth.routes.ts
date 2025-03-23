import { Router } from 'express';
import { verifyToken } from '../middleware/auth';
import { authRateLimit } from '../middleware/rateLimit';
import proxy from './proxy';
import config from '../config';
import services from '../config/services';

const router = Router();
const authService = services.find(service => service.name === 'auth');

if (!authService) {
  throw new Error('Servicio de autenticación no configurado');
}

// Rutas públicas (sin autenticación)
const publicRoutes = authService.routes.filter(route => !route.auth);
publicRoutes.forEach(route => {
  // Corregido: la ruta debe ser solo el path final, no incluir /api/auth
  router.all(
    route.path,
    (req, res, next) => {
      console.log(`Accediendo a ruta pública: ${route.path}`);
      
      // Aplicar rate limiting para rutas de autenticación sensibles
      if (route.path.includes('/login') || route.path.includes('/register')) {
        authRateLimit(req, res, next);
      } else {
        next();
      }
    },
    proxy.createServiceProxy('auth', config.services.auth)
  );
});

// Rutas protegidas (requieren autenticación)
const protectedRoutes = authService.routes.filter(route => route.auth);
protectedRoutes.forEach(route => {
  // Corregido: la ruta debe ser solo el path final, no incluir /api/auth
  router.all(
    route.path,
    verifyToken,
    (req, res, next) => {
      console.log(`Accediendo a ruta protegida: ${route.path}`);
      next();
    },
    proxy.createServiceProxy('auth', config.services.auth)
  );
});

export default router;