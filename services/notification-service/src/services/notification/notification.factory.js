const EmailNotifier = require('./email.notifier');
const SMSNotifier = require('./sms.notifier');
const logger = require('../../utils/logger');

/**
 * Factory para crear notificadores según el tipo
 * Implementación del patrón Factory Method
 */
class NotificationFactory {
  /**
   * Crea y devuelve el notificador adecuado según el tipo
   * @param {string} type - Tipo de notificación ('email' o 'sms')
   * @returns {Object} - Instancia del notificador apropiado
   */
  createNotifier(type) {
    switch (type.toLowerCase()) {
      case 'email':
        return new EmailNotifier();
      case 'sms':
        return new SMSNotifier();
      default:
        logger.warn(`Tipo de notificación no soportado: ${type}. Usando email por defecto.`);
        return new EmailNotifier();
    }
  }
}

module.exports = new NotificationFactory();