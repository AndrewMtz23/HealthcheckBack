// Actualización de ml.routes.ts
import { Router, Request, Response, NextFunction } from 'express';
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

/**
 * Middleware para validar límites de entrada y asegurar que el usuario_id
 * provenga exclusivamente de la sesión JWT autenticada (evitando suplantaciones).
 */
export const validateAndSanitizeClassifyRequest = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  if (!req.user || !Number.isInteger(req.user.id) || req.user.id <= 0) {
    res.status(401).json({ status: 'error', message: 'Se requiere una sesión válida.' });
    return;
  }
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
    res.status(400).json({
      status: 'error',
      message: 'Cuerpo de la petición inválido. Se requiere un objeto JSON.',
    });
    return;
  }

  const { text, url } = req.body;

  if (text !== undefined && url !== undefined) {
    res.status(400).json({status: 'error', message: 'Envía solo text o url.'});
    return;
  }

  if (!text && !url) {
    res.status(400).json({
      status: 'error',
      message: 'Debe proporcionar al menos "text" o "url" para el análisis.',
    });
    return;
  }

  if (text !== undefined) {
    if (typeof text !== 'string' || text.trim().length < 10) {
      res.status(400).json({
        status: 'error',
        message: 'El texto debe contener al menos 10 caracteres para poder ser analizado.',
      });
      return;
    }
    if (text.length > 50000) {
      res.status(400).json({
        status: 'error',
        message: 'El texto excede el límite máximo permitido de 50,000 caracteres.',
      });
      return;
    }
  }

  if (url !== undefined) {
    if (typeof url !== 'string' || !/^https?:\/\//i.test(url.trim())) {
      res.status(400).json({
        status: 'error',
        message: 'La URL debe comenzar con http:// o https://.',
      });
      return;
    }
    if (url.trim().length > 2048) {
      res.status(400).json({
        status: 'error',
        message: 'La URL excede el límite máximo de 2048 caracteres.',
      });
      return;
    }
  }

  // Garantizar aislamiento de identidad: si el cliente suministró un usuario_id,
  // se sobrescribe obligatoriamente con el id de la sesión validada req.user.
  req.body.usuario_id = req.user.id;

  next();
};

// Rutas de classify
router.post(
  '/classify/predict',
  verifyToken,
  defaultRateLimiter,
  validateAndSanitizeClassifyRequest,
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
