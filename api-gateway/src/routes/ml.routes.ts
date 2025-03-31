// Actualización de ml.routes.ts
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

// Rate limiters para diferentes endpoints
const defaultRateLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minuto
  max: 10 // 10 peticiones por minuto
});

const trainRateLimiter = createRateLimiter({
  windowMs: 5 * 60 * 1000, // 5 minutos
  max: 2 // 2 peticiones cada 5 minutos (operación intensiva)
});

const scrapeRateLimiter = createRateLimiter({
  windowMs: 2 * 60 * 1000, // 2 minutos
  max: 5 // 5 peticiones cada 2 minutos
});

// Rutas de classify
router.post(
  '/classify/predict',
  verifyToken,
  defaultRateLimiter,
  proxy.createServiceProxy('ml', config.services.ml)
);

// Rutas de scraping - requieren autenticación de administrador
router.post(
  '/classify/scrape/google',
  verifyToken,
  scrapeRateLimiter,
  (req, res, next) => {
    // Verificar si el usuario es admin
    if (req.user && req.user.rol === 'admin') {
      next();
    } else {
      res.status(403).json({
        status: 'error',
        message: 'Acceso denegado. Se requieren permisos de administrador.'
      });
    }
  },
  proxy.createServiceProxy('ml', config.services.ml)
);

router.post(
  '/classify/scrape/twitter',
  verifyToken,
  scrapeRateLimiter,
  (req, res, next) => {
    // Verificar si el usuario es admin
    if (req.user && req.user.rol === 'admin') {
      next();
    } else {
      res.status(403).json({
        status: 'error',
        message: 'Acceso denegado. Se requieren permisos de administrador.'
      });
    }
  },
  proxy.createServiceProxy('ml', config.services.ml)
);

// Rutas de entrenamiento y gestión de modelos - solo admin
router.post(
  '/train/train',
  verifyToken,
  trainRateLimiter,
  (req, res, next) => {
    if (req.user && req.user.rol === 'admin') {
      next();
    } else {
      res.status(403).json({
        status: 'error',
        message: 'Acceso denegado. Se requieren permisos de administrador.'
      });
    }
  },
  proxy.createServiceProxy('ml', config.services.ml)
);

router.get(
  '/train/models',
  verifyToken,
  defaultRateLimiter,
  (req, res, next) => {
    if (req.user && req.user.rol === 'admin') {
      next();
    } else {
      res.status(403).json({
        status: 'error',
        message: 'Acceso denegado. Se requieren permisos de administrador.'
      });
    }
  },
  proxy.createServiceProxy('ml', config.services.ml)
);

router.post(
  '/train/models/:model_id/activate',
  verifyToken,
  defaultRateLimiter,
  (req, res, next) => {
    if (req.user && req.user.rol === 'admin') {
      next();
    } else {
      res.status(403).json({
        status: 'error',
        message: 'Acceso denegado. Se requieren permisos de administrador.'
      });
    }
  },
  proxy.createServiceProxy('ml', config.services.ml)
);

router.delete(
  '/train/models/:model_id',
  verifyToken,
  defaultRateLimiter,
  (req, res, next) => {
    if (req.user && req.user.rol === 'admin') {
      next();
    } else {
      res.status(403).json({
        status: 'error',
        message: 'Acceso denegado. Se requieren permisos de administrador.'
      });
    }
  },
  proxy.createServiceProxy('ml', config.services.ml)
);

// Rutas de chatbot
router.post(
  '/chatbot/chat',
  verifyToken,
  defaultRateLimiter,
  proxy.createServiceProxy('ml', config.services.ml)
);

export default router;