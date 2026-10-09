import { Request, Response, NextFunction } from 'express';
import axios from 'axios';
import { HttpError } from '../middleware/errorHandler';
import { logger } from '../middleware/logger';
import {createHmac} from 'crypto';

/**
 * Función para crear un proxy hacia un servicio específico
 * @param serviceName Nombre del servicio
 * @param serviceUrl URL base del servicio
 */
export const createServiceProxy = (
  serviceName: string,
  serviceUrl: string
) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // La URL correcta debería ser http://localhost:3001/api/auth/login
      const targetUrl = `${serviceUrl}/api/${serviceName}${req.path}`;

      logger.debug(`Proxy request to ${serviceName}: ${req.method} ${targetUrl}`);

      // Preparar headers manteniendo Authorization si existe
      const headers: Record<string, string> = {};
      const googleRoute = serviceName === 'auth' && ['/google','/google/callback','/google/failure'].includes(req.path);
      if (googleRoute && req.headers.cookie) headers.Cookie = req.headers.cookie;
      if (serviceName === 'auth' && req.path.startsWith('/password/')) {
        const secret = process.env.JWT_SECRET || '', client = req.ip || '', time = String(Date.now());
        if (secret.length < 16 || secret === 'default_secret_key') {next(new HttpError('El servicio de recuperación no está configurado.',503));return;}
        headers['X-Auth-Client-IP'] = client;
        headers['X-Auth-Client-Time'] = time;
        headers['X-Auth-Client-Proof'] = createHmac('sha256',secret).update(`healthcheck-recovery-client\n${time}\n${client}`).digest('hex');
      }

      if (req.headers.authorization) {
        headers['Authorization'] = req.headers.authorization;
      }

      const configuredTimeout = Number(process.env.PROXY_TIMEOUT_MS || 30000);
      const timeoutMs = Number.isFinite(configuredTimeout) && configuredTimeout > 0
        ? Math.min(configuredTimeout, 30000) : 30000;
      // Internal headers are always derived here, never forwarded from clients.
      if (serviceName === 'ml') {
        if (!req.user || !Number.isInteger(req.user.id) || req.user.id <= 0) {
          next(new HttpError('Se requiere una sesión válida.', 401));
          return;
        }
        const secret = process.env.ML_GATEWAY_SECRET || '';
        if (secret.length < 32) {
          next(new HttpError('El servicio de análisis no está configurado.', 503));
          return;
        }
        headers['X-User-Id'] = String(req.user.id);
        headers['X-User-Role'] = req.user.rol;
        headers['X-Gateway-Secret'] = secret;
        headers['X-Request-Deadline'] = String((Date.now() + timeoutMs - 1000) / 1000);
      }

      // Transferir user-agent y otras cabeceras relevantes
      if (req.headers['user-agent']) {
        headers['User-Agent'] = req.headers['user-agent'] as string;
      }

      if (req.headers['content-type']) {
        headers['Content-Type'] = req.headers['content-type'] as string;
      }

      const response = await axios({
        method: req.method as any,
        url: targetUrl,
        headers,
        data: req.body,
        params: req.query,
        timeout: timeoutMs,
        validateStatus: () => true, // Aceptar cualquier código de estado
        maxRedirects: 0 // No seguir redirecciones automáticamente
      });

      if (serviceName === 'auth') {
        res.setHeader('Cache-Control', 'no-store');
        res.setHeader('Referrer-Policy', 'no-referrer');
      }
      if (googleRoute && response.headers['set-cookie']) res.setHeader('Set-Cookie', response.headers['set-cookie']);
      // Manejar redirecciones (códigos 301, 302, 303, 307, 308)
      if (response.status >= 300 && response.status < 400 && response.headers.location) {
        // Redirigir al cliente
        return res.redirect(response.headers.location);
      }

      // Logear la respuesta para depuración
      logger.debug(`Respuesta del servicio ${serviceName}: Status ${response.status}`);

      // Enviar la respuesta al cliente
      res.status(response.status).json(response.data);
    } catch (error) {
      // Si es un error de axios y tiene una respuesta, extraer el mensaje y el status
      if (axios.isAxiosError(error) && error.response) {
        const status = error.response.status;
        const message = error.response.data?.message || error.message;
        next(new HttpError(message, status));
      } else if (axios.isAxiosError(error) && (error.code === 'ECONNABORTED' || (error.message && error.message.toLowerCase().includes('timeout')))) {
        logger.error(`Timeout en proxy a ${serviceName}: ${error.message}`);
        next(new HttpError(`El servicio ${serviceName} tardó demasiado en responder y la solicitud expiró.`, 504));
      } else if (axios.isAxiosError(error) && error.code === 'ECONNREFUSED') {
        // Error de conexión rechazada
        logger.error(`Servicio ${serviceName} no disponible: ${error.message}`);
        next(new HttpError(`El servicio ${serviceName} no está disponible en este momento. Por favor, inténtelo más tarde.`, 503));
      } else {
        // Para otros errores, crear un error genérico
        logger.error(`Error en proxy a ${serviceName}: ${(error as Error).message}`);
        next(new HttpError(`Error al comunicarse con el servicio ${serviceName}`, 502));
      }
    }
  };
};

export default {
  createServiceProxy,
};
