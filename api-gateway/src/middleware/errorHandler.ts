import { Request, Response, NextFunction } from 'express';
import config from '../config';

/**
 * Estructura personalizada para errores con código HTTP
 */
export class HttpError extends Error {
  status: number;
  
  constructor(message: string, status: number = 500) {
    super(message);
    this.status = status;
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Middleware para manejar rutas no encontradas (404)
 */
export const notFoundHandler = (req: Request, res: Response, next: NextFunction): void => {
  const error = new HttpError(`No se encontró la ruta: ${req.originalUrl}`, 404);
  next(error);
};

/**
 * Middleware para gestionar errores
 */
export const errorHandler = (
  err: Error | HttpError,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const status = err instanceof HttpError ? err.status : 500;
  const message = err.message || 'Error interno del servidor';
  
  // Formatear respuesta de error
  res.status(status).json({
    status: 'error',
    message,
    // Incluir detalles del error en desarrollo pero no en producción
    ...(config.nodeEnv !== 'production' && { stack: err.stack }),
  });
};

export default {
  HttpError,
  notFoundHandler,
  errorHandler,
};