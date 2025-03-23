import { Request, Response, NextFunction } from 'express';
import axios from 'axios';
import { HttpError } from '../middleware/errorHandler';
import { logger } from '../middleware/logger';

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
      
      if (req.headers.authorization) {
        headers['Authorization'] = req.headers.authorization;
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
        validateStatus: () => true, // Aceptar cualquier código de estado
        maxRedirects: 0 // No seguir redirecciones automáticamente
      });
      
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