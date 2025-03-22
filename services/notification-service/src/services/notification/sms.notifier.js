const NotificationInterface = require('./notification.interface');
const { smsConfig } = require('../../config');
const logger = require('../../utils/logger');

/**
 * Implementación de notificación por SMS
 */
class SMSNotifier extends NotificationInterface {
  /**
   * Envía un SMS individual
   * @param {Object} recipient - Destinatario {telefono}
   * @param {Object} content - Contenido {titulo, mensaje}
   * @returns {Promise<boolean>} - Éxito del envío
   */
  async send(recipient, content) {
    try {
      const { telefono } = recipient;
      const { titulo, mensaje } = content;
      
      // Formato del mensaje
      const smsMessage = `${titulo}: ${mensaje}`;
      
      // Formato del número de teléfono
      let formattedNumber = telefono;
      if (!telefono.startsWith('+')) {
        formattedNumber = `+${telefono}`;
      }
      
      await smsConfig.client.messages.create({
        body: smsMessage,
        from: smsConfig.phoneNumber,
        to: formattedNumber
      });
      
      return true;
    } catch (error) {
      logger.error('Error al enviar SMS:', error);
      return false;
    }
  }
  
  /**
   * Envía múltiples SMS (uno por notificación)
   * @param {Array} notifications - Lista de notificaciones
   * @returns {Promise<Array>} - IDs de notificaciones enviadas
   */
  async sendBulk(notifications) {
    const sentNotificationIds = [];
    
    for (const notification of notifications) {
      try {
        const { id, telefono, titulo, mensaje } = notification;
        
        if (!telefono) continue;
        
        const recipient = { telefono };
        const content = { titulo, mensaje };
        
        const success = await this.send(recipient, content);
        
        if (success) {
          sentNotificationIds.push(id);
        }
      } catch (error) {
        // Continuar con la siguiente notificación en caso de error
        logger.error(`Error al enviar SMS para notificación ${notification.id}:`, error);
      }
    }
    
    return sentNotificationIds;
  }
}

module.exports = SMSNotifier;