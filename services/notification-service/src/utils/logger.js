/**
 * Utilidad simple para logging
 */
const logger = {
    /**
     * Registra mensaje informativo
     * @param {string} message - Mensaje a registrar
     * @param {any} data - Datos adicionales (opcional)
     */
    info: (message, data) => {
      console.log(`[INFO][${new Date().toISOString()}] ${message}`, data ? data : '');
    },
    
    /**
     * Registra mensaje de advertencia
     * @param {string} message - Mensaje a registrar
     * @param {any} data - Datos adicionales (opcional)
     */
    warn: (message, data) => {
      console.warn(`[WARN][${new Date().toISOString()}] ${message}`, data ? data : '');
    },
    
    /**
     * Registra mensaje de error
     * @param {string} message - Mensaje a registrar
     * @param {any} error - Error a registrar (opcional)
     */
    error: (message, error) => {
      console.error(`[ERROR][${new Date().toISOString()}] ${message}`, error ? error : '');
    }
  };
  
  module.exports = logger;