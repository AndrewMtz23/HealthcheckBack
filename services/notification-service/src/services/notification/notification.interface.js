/**
 * Clase que define la interfaz para todos los notificadores
 * Actúa como una "clase abstracta" en JavaScript
 */
class NotificationInterface {
    /**
     * Método para enviar una notificación
     * @param {Object} recipient - Información del destinatario
     * @param {Object} content - Contenido de la notificación
     * @returns {Promise<boolean>} - Verdadero si se envió correctamente
     */
    async send(recipient, content) {
      throw new Error('El método send debe ser implementado por las clases hijas');
    }
    
    /**
     * Método para enviar múltiples notificaciones agrupadas
     * @param {Array} notifications - Lista de notificaciones a enviar
     * @returns {Promise<Array>} - Lista de resultados
     */
    async sendBulk(notifications) {
      throw new Error('El método sendBulk debe ser implementado por las clases hijas');
    }
  }
  
  module.exports = NotificationInterface;