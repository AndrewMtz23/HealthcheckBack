import { Response } from 'express';

interface SuccessResponseOptions {
  message?: string;
  data?: any;
  meta?: Record<string, any>;
}

interface ErrorResponseOptions {
  message: string;
  errors?: any;
  code?: string | null;
}

/**
 * Función para formatear respuestas exitosas
 */
export const successResponse = (
  res: Response,
  { message = 'Operación exitosa', data = null, meta = {} }: SuccessResponseOptions,
  statusCode: number = 200
): Response => {
  return res.status(statusCode).json({
    status: 'success',
    message,
    data,
    meta,
  });
};

/**
 * Función para formatear respuestas de error
 */
export const errorResponse = (
  res: Response,
  { message, errors = null, code = null }: ErrorResponseOptions,
  statusCode: number = 400
): Response => {
  return res.status(statusCode).json({
    status: 'error',
    message,
    ...(errors && { errors }),
    ...(code && { code }),
  });
};

export default {
  successResponse,
  errorResponse,
};