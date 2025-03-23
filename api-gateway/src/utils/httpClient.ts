import axios, { AxiosRequestConfig, AxiosResponse, AxiosError } from 'axios';
import { HttpError } from '../middleware/errorHandler';
import { logger } from '../middleware/logger';

// Interfaz para respuestas de error consistentes
interface ErrorResponse {
  message?: string;
  error?: string;
  status?: string;
  [key: string]: any;
}

// Crear cliente axios con configuración por defecto
const httpClient = axios.create({
  timeout: 30000, // 30 segundos
  headers: {
    'Content-Type': 'application/json',
  },
});

// Interceptor para el manejo de peticiones
httpClient.interceptors.request.use(
  (config) => {
    // Loguear la petición (sin datos sensibles)
    logger.debug(`Solicitud saliente: ${config.method?.toUpperCase()} ${config.url}`);
    return config;
  },
  (error) => {
    logger.error(`Error en solicitud: ${error.message}`);
    return Promise.reject(error);
  }
);

// Interceptor para el manejo de respuestas
httpClient.interceptors.response.use(
  (response) => {
    // Loguear la respuesta exitosa (solo metadata, no datos)
    logger.debug(`Respuesta exitosa: ${response.status} ${response.config.url}`);
    return response;
  },
  (error: AxiosError) => {
    // Formatear el error para ser compatible con nuestro sistema
    if (error.response) {
      // El servidor respondió con un código de error
      logger.error(`Error del servicio: ${error.response.status} ${error.config?.url}`);
      
      const errorData = error.response.data as ErrorResponse | undefined;
      
      // Extraer mensaje de error de la estructura de datos
      let errorMessage = 'Error del servicio';
      if (typeof errorData === 'object' && errorData !== null) {
        // Intentar obtener el mensaje de diferentes formatos comunes de API
        errorMessage = errorData.message || 
                      errorData.error || 
                      (typeof errorData.status === 'string' ? errorData.status : '') || 
                      error.message;
      } else if (typeof errorData === 'string') {
        errorMessage = errorData;
      } else {
        errorMessage = error.message;
      }
      
      const errorStatus = error.response.status;
      
      return Promise.reject(new HttpError(errorMessage, errorStatus));
    } else if (error.request) {
      // La petición fue hecha pero no hubo respuesta
      logger.error(`Error de red: ${error.message}`);
      return Promise.reject(new HttpError('Error de red. El servicio no está disponible.', 503));
    } else {
      // Error al configurar la petición
      logger.error(`Error de configuración: ${error.message}`);
      return Promise.reject(new HttpError('Error en la configuración de la solicitud.', 500));
    }
  }
);

// Función para realizar peticiones HTTP
export const request = async <T>(config: AxiosRequestConfig): Promise<T> => {
  try {
    const response: AxiosResponse<T> = await httpClient(config);
    return response.data;
  } catch (error) {
    if (error instanceof HttpError) {
      throw error;
    }
    throw new HttpError((error as Error).message);
  }
};

export default {
  httpClient,
  request,
};