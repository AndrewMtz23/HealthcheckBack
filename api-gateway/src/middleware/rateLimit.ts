import rateLimit from 'express-rate-limit';
import config from '../config';

// Rate limiting global por defecto
export const defaultRateLimit = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.max,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: 'error',
    message: 'Demasiadas solicitudes. Por favor, inténtalo de nuevo más tarde.',
  },
});

// Crear un rate limiter personalizado
export const createRateLimiter = (options: { windowMs: number; max: number }) => {
  return rateLimit({
    windowMs: options.windowMs,
    max: options.max,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      status: 'error',
      message: 'Demasiadas solicitudes para este endpoint. Por favor, inténtalo de nuevo más tarde.',
    },
  });
};

// Rate limiting más estricto para endpoints sensibles (como autenticación)
export const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 20, // 20 intentos por 15 minutos
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: 'error',
    message: 'Demasiados intentos de autenticación. Por favor, inténtalo de nuevo más tarde.',
  },
});

export default {
  defaultRateLimit,
  createRateLimiter,
  authRateLimit,
};